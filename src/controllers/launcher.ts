import jwt from "jsonwebtoken";
import type { Context } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import {
  findUserByUsername,
  findUserByAccountId,
  findProfile,
  createUser,
  createProfiles,
  findUserByEmail,
  findUserByDiscordId,
  getHypeLeaderboard,
  saveProfile,
  addArenaHype,
  updateUserDiscordId,
} from "../db/queries";
import crypto from "crypto";

const DISCORD_API = "https://discord.com/api/v10";

type DiscordUser = {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  discriminator: string;
};

function getDiscordAvatarUrl(userId: string, avatarHash: string | null | undefined, discriminator?: string): string {
  if (avatarHash) {
    const ext = avatarHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}`;
  }
  const index = (!discriminator || discriminator === "0")
    ? Number(BigInt(userId) >> 22n) % 6
    : parseInt(discriminator, 10) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

type Session = {
  accountId: string;
  username: string;
  discordId: string;
  email: string;
  password: string;
};

function getDiscordAuthUrl(): string {
  const clientId = process.env.DISCORD_CLIENT_ID ?? "";
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ??
    "http://45.92.217.51:3551/api/exlo/auth/discord/callback";
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email`;
}

function setSessionCookie(c: Context, session: Session) {
  setCookie(c, "exlo_session", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getVbucks(c: Context): Promise<Response> {
  const name = c.req.param("name");

  const user = await findUserByUsername(name);
  if (!user) return c.json({ error: "User not found" }, 404);

  const profilesData = await findProfile(user.accountId);
  if (!profilesData) return c.json({ error: "Profile not found" }, 404);

  const commonCore = (profilesData as Record<string, Record<string, unknown>>)[
    "common_core"
  ];
  if (!commonCore) return c.json({ error: "Common core profile not found" }, 404);

  const items = commonCore.items as Record<string, { quantity?: number }>;
  const vbucks = items?.["currency:mtxpurchased"]?.quantity ?? 0;

  return c.json({ username: user.username, vbucks });
}

export async function getHype(c: Context): Promise<Response> {
  const name = c.req.param("name");

  const user = await findUserByUsername(name);
  if (!user) return c.json({ error: "User not found" }, 404);

  return c.json({
    username: user.username,
    hype: user.arenaHype,
    division: user.arenaDivision,
  });
}

export async function getHypeLeaderboardHandler(c: Context): Promise<Response> {
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "100", 10) || 100, 1), 500);

  const leaderboard = await getHypeLeaderboard(limit);

  const entries = await Promise.all(
    leaderboard.map(async (user, index) => {
      let discordAvatar: string | null = null;

      if (user.discordId) {
        try {
          const res = await fetch(`${DISCORD_API}/users/${user.discordId}`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
          });
          if (res.ok) {
            const data = await res.json() as { avatar?: string; discriminator?: string };
            //console.log(`[Leaderboard] Discord user ${user.discordId}: avatar=${data.avatar}, discriminator=${data.discriminator}`);
            discordAvatar = getDiscordAvatarUrl(user.discordId, data.avatar, data.discriminator);
          } else {
            //console.warn(`[Leaderboard] Discord API ${res.status} for ${user.discordId}: ${await res.text()}`);
          }
        } catch (e) {
          //console.warn(`[Leaderboard] Fetch failed for ${user.discordId}:`, e);
        }
      } else {
        //console.log(`[Leaderboard] User ${user.username} has no discordId`);
      }

      return {
        id: index + 1,
        username: user.username,
        hype: user.arenaHype,
        division: user.arenaDivision,
        discordAvatar,
      };
    })
  );

  return c.json({
    leaderboard: entries,
    total: entries.length,
  });
}

export async function discordAuth(c: Context): Promise<Response> {
  return c.redirect(getDiscordAuthUrl());
}

export async function discordCallback(c: Context): Promise<Response> {
  const code = c.req.query("code");

  if (!code) {
    return c.json({ error: "No authorization code provided" }, 400);
  }

  const clientId = process.env.DISCORD_CLIENT_ID || "";
  const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ||
    "http://45.92.217.51:3551/api/exlo/auth/discord/callback";

  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    //console.error("[Discord OAuth] Token exchange failed:", tokenResponse.status, errText);
    return c.json({ error: "Failed to exchange code for token", details: errText }, 500);
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string };

  const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    return c.json({ error: "Failed to fetch user data from Discord" }, 500);
  }

  const discordUser = (await userResponse.json()) as {
    id: string;
    username: string;
    email: string;
    avatar: string;
  };

  //console.log(`[Discord OAuth] Discord user fetched: id=${discordUser.id} username=${discordUser.username} email=${discordUser.email}`);

  let existingUser = await findUserByEmail(discordUser.email) ?? await findUserByDiscordId(discordUser.id);
  //console.log(`[Discord OAuth] DB lookup: ${existingUser ? `found accountId=${existingUser.accountId} discordId=${existingUser.discordId}` : "not found, creating new user"}`);

  if (!existingUser) {
    const accountId = crypto.randomUUID().replace(/-/g, "");
    const matchmakingId = crypto.randomUUID().replace(/-/g, "");
    const randomPassword = crypto.randomBytes(16).toString("hex");
    let username = discordUser.username;
    const existingName = await findUserByUsername(username);
    if (existingName) username = discordUser.username + Math.floor(Math.random() * 10000);
    //console.log(`[Discord OAuth] Creating new user: accountId=${accountId} username=${username} discordId=${discordUser.id}`);
    await createUser({
      accountId,
      username,
      email: discordUser.email,
      password: randomPassword,
      matchmakingId,
      isServer: false,
      banned: false,
      arenaDivision: 1,
      arenaHype: 0,
      discordId: discordUser.id,
    });
    await createProfiles(accountId, username);
    existingUser = await findUserByEmail(discordUser.email);
    //console.log(`[Discord OAuth] After create, re-fetch: ${existingUser ? `accountId=${existingUser.accountId} discordId=${existingUser.discordId}` : "STILL NULL - DB issue"}`);
  }

  if (!existingUser) {
    return c.json({ error: "User not registered" }, 500);
  }

  if (existingUser.discordId !== discordUser.id) {
    //console.log(`[Discord OAuth] Updating discordId: ${existingUser.discordId} -> ${discordUser.id} for accountId=${existingUser.accountId}`);
    await updateUserDiscordId(existingUser.accountId, discordUser.id);
    existingUser = { ...existingUser, discordId: discordUser.id };
  }

  //console.log(`[Discord OAuth] Auth complete: accountId=${existingUser.accountId} username=${existingUser.username} discordId=${existingUser.discordId}`);
  const token = jwt.sign(
    {
      email: existingUser.email,
      password: existingUser.password,
      username: existingUser.username,
      avatar: discordUser.avatar,
      discordId: existingUser.discordId,
    },
    "secret",
    { expiresIn: "10m" }
  );

  return c.redirect(`exlo://${token}`);
}

export async function getProfile(c: Context): Promise<Response> {
  const sessionCookie = getCookie(c, "exlo_session");
  if (!sessionCookie) return c.redirect("/api/exlo/auth/discord");

  const session = JSON.parse(sessionCookie) as Session;

  return c.json({
    accountId: session.accountId,
    username: session.username,
    discordId: session.discordId,
    email: session.email,
    password: session.password,
  });
}

export async function getApiUser(c: Context): Promise<Response> {
  const sessionCookie = getCookie(c, "exlo_session");
  if (!sessionCookie) return c.json({ error: "Unauthorized" }, 401);

  const session = JSON.parse(sessionCookie) as Session;

  return c.json({
    accountId: session.accountId,
    username: session.username,
    discordId: session.discordId,
  });
}

async function addVbucksToUser(
  accountId: string,
  amount: number
): Promise<{ success: boolean; previousBalance: number; newBalance: number }> {
  const profilesData = await findProfile(accountId);
  if (!profilesData) return { success: false, previousBalance: 0, newBalance: 0 };

  const commonCore = (profilesData as Record<string, Record<string, unknown>>)[
    "common_core"
  ];
  if (!commonCore) return { success: false, previousBalance: 0, newBalance: 0 };

  const items = (commonCore.items ?? {}) as Record<string, unknown>;
  const mtxKey = "currency:mtxpurchased";
  const currentAmount = ((items[mtxKey] as Record<string, unknown>)?.quantity as number) ?? 0;
  const newAmount = currentAmount + amount;

  items[mtxKey] = {
    templateId: "Currency:MtxPurchased",
    attributes: { platform: "Shared" },
    quantity: newAmount,
  };

  commonCore.items = items;
  commonCore.updated = new Date().toISOString();

  await saveProfile(accountId, "common_core", commonCore);

  return { success: true, previousBalance: currentAmount, newBalance: newAmount };
}

export async function vbucksOnKill(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const username = body.user ?? body.username;
  if (!username) return c.json({ error: "Missing user field" }, 400);

  const user = await findUserByUsername(username);
  if (!user) return c.json({ error: "User not found" }, 404);

  const result = await addVbucksToUser(user.accountId, 50);
  if (!result.success) return c.json({ error: "Failed to add vbucks" }, 500);

  return c.json({
    success: true,
    username: user.username,
    reward: 50,
    reason: "kill",
    previousBalance: result.previousBalance,
    newBalance: result.newBalance,
  });
}

export async function vbucksOnWin(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const username = body.user ?? body.username;
  if (!username) return c.json({ error: "Missing user field" }, 400);

  const user = await findUserByUsername(username);
  if (!user) return c.json({ error: "User not found" }, 404);

  const result = await addVbucksToUser(user.accountId, 150);
  if (!result.success) return c.json({ error: "Failed to add vbucks" }, 500);

  return c.json({
    success: true,
    username: user.username,
    reward: 150,
    reason: "win",
    previousBalance: result.previousBalance,
    newBalance: result.newBalance,
  });
}

export async function addVbucks(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const amount = parseInt(body.amount, 10);
  const username = body.user ?? body.username;

  if (!username) return c.json({ error: "Missing user field" }, 400);
  if (!amount || amount <= 0) return c.json({ error: "Invalid amount" }, 400);

  const user = await findUserByUsername(username);
  if (!user) return c.json({ error: "User not found" }, 404);

  const result = await addVbucksToUser(user.accountId, amount);
  if (!result.success) return c.json({ error: "Failed to add vbucks" }, 500);

  return c.json({
    success: true,
    username: user.username,
    reward: amount,
    previousBalance: result.previousBalance,
    newBalance: result.newBalance,
  });
}

export async function addHype(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const amount = parseInt(body.amount, 10);
  const username = body.user ?? body.username;

  if (isNaN(amount)) return c.json({ error: "Invalid amount" }, 400);
  if (!username) return c.json({ error: "Missing user field" }, 400);

  const user = await findUserByUsername(username);
  if (!user) return c.json({ error: "User not found" }, 404);

  const result = await addArenaHype(user.accountId, amount);
  if (!result) return c.json({ error: "Failed to update hype" }, 500);

  return c.json({
    success: true,
    username: user.username,
    amount,
    previousHype: user.arenaHype ?? 0,
    previousDivision: user.arenaDivision ?? 1,
    newHype: result.hype,
    newDivision: result.division,
  });
}

export async function hypeOnKill(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const username = body.user ?? body.username;
  if (!username) return c.json({ error: "Missing user field" }, 400);

  const user = await findUserByUsername(username);
  if (!user) return c.json({ error: "User not found" }, 404);

  const result = await addArenaHype(user.accountId, 20);
  if (!result) return c.json({ error: "Failed to add hype" }, 500);

  return c.json({
    success: true,
    username: user.username,
    reward: 20,
    reason: "kill",
    previousHype: user.arenaHype ?? 0,
    previousDivision: user.arenaDivision ?? 1,
    newHype: result.hype,
    newDivision: result.division,
  });
}

export async function hypeOnPlacement(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const placement = parseInt(body.placement, 10);
  const username = body.user ?? body.username;

  if (!username) return c.json({ error: "Missing user field" }, 400);
  if (!placement || placement < 1) return c.json({ error: "Invalid placement" }, 400);

  const user = await findUserByUsername(username);
  if (!user) return c.json({ error: "User not found" }, 404);

  const hypeReward =
    placement === 1 ? 100
    : placement <= 3 ? 50
    : placement <= 5 ? 25
    : placement <= 10 ? 15
    : placement <= 15 ? 10
    : placement <= 25 ? 5
    : 0;

  if (hypeReward === 0) {
    return c.json({
      success: true,
      username: user.username,
      reward: 0,
      reason: "placement",
      placement,
      message: "No hype reward for this placement",
    });
  }

  const result = await addArenaHype(user.accountId, hypeReward);
  if (!result) return c.json({ error: "Failed to add hype" }, 500);

  return c.json({
    success: true,
    username: user.username,
    reward: hypeReward,
    reason: "placement",
    placement,
    previousHype: user.arenaHype ?? 0,
    previousDivision: user.arenaDivision ?? 1,
    newHype: result.hype,
    newDivision: result.division,
  });
}

export async function GetUser(c: Context) {
  const username = c.req.param("username");
  if (!username) return c.json({ error: "Missing username parameter" }, 400);

  let user;
  try {
    user = await findUserByUsername(username);
  } catch (e) {
    console.error("DB error in findUserByUsername:", e);
    return c.json({ error: "Internal server error" }, 500);
  }

  if (!user) return c.json({ error: "User not found" }, 404);

  let vbucks = 0;
  try {
    const vbucksRes = await fetch(
      `http://45.92.217.51:3551/api/exlo/vbucks/${user.username}`
    );
    const vbucksData = await vbucksRes.json();
    vbucks = vbucksData?.vbucks ?? 0;
  } catch (e) {
    vbucks = 0;
  }

  let discordAvatar = null;
  let discordRoles: string[] = [];
  if (user.discordId) {
    try {
      const guildId = "1443903549267382306";
      const botHeaders = { "Authorization": `Bot ${process.env.DISCORD_TOKEN}` };

      const [discordRes, rolesRes] = await Promise.all([
        fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user.discordId}`, { headers: botHeaders }),
        fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: botHeaders }),
      ]);

      if (discordRes.ok && rolesRes.ok) {
        const discordData = await discordRes.json() as {
          avatar?: string;
          user?: { avatar?: string; discriminator?: string };
          roles?: string[];
        };
        const guildRoles = await rolesRes.json() as { id: string; name: string; position: number }[];

        const rolePositionMap = new Map(guildRoles.map((r) => [r.id, r.position]));
        const roleNameMap = new Map(guildRoles.map((r) => [r.id, r.name]));

        if (discordData.avatar) {
          const ext = discordData.avatar.startsWith("a_") ? "gif" : "png";
          discordAvatar = `https://cdn.discordapp.com/guilds/${guildId}/users/${user.discordId}/avatars/${discordData.avatar}.${ext}`;
        } else {
          discordAvatar = getDiscordAvatarUrl(user.discordId, discordData.user?.avatar, discordData.user?.discriminator);
        }

        discordRoles = (discordData.roles ?? [])
          .sort((a, b) => (rolePositionMap.get(b) ?? 0) - (rolePositionMap.get(a) ?? 0))
          .map((id) => roleNameMap.get(id) ?? id);
      } else {
        const errText = await discordRes.text();
      }
    } catch (e) {
    }
  }

  const res = {
    username: user.username,
    accountId: user.accountId,
    vbucks,
    arenahype: user.arenaHype,
    discordAvatar,
    discordRoles,
  };
  return c.json(res);
}