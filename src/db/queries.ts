import { eq, and, or, ilike, desc } from "drizzle-orm";
import { getDb, users, tokens, profiles, friends, deviceAuths, matchmaking, itemShop, bannedIps } from "./index";
import type { User, NewUser, Token, Profile, Friends, DeviceAuth, Matchmaking, ItemShop, FriendEntry, BannedIp } from "./schema";
import fs from "fs";
import path from "path";

export async function findUserByAccountId(accountId: string): Promise<User | undefined> {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.accountId, accountId)).limit(1);
  return result[0];
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function findUsersByAccountIds(accountIds: string[]): Promise<User[]> {
  const db = getDb();
  if (accountIds.length === 0) return [];
  const result = await db.select().from(users).where(
    and(
      or(...accountIds.map(id => eq(users.accountId, id))),
      eq(users.banned, false)
    )
  ).limit(100);
  return result;
}

export async function findUsersByUsername(username: string): Promise<User[]> {
  const db = getDb();
  const result = await db.select().from(users).where(
    and(
      ilike(users.username, `${username}%`),
      eq(users.banned, false)
    )
  ).limit(100);
  return result;
}

export async function getHypeLeaderboard(limit: number = 100): Promise<User[]> {
  const db = getDb();
  const result = await db.select().from(users)
    .where(eq(users.banned, false))
    .orderBy(desc(users.arenaHype))
    .limit(limit);
  return result;
}

export async function createUser(user: NewUser): Promise<void> {
  const db = getDb();
  await db.insert(users).values(user);
}

export async function updateUser(accountId: string, changes: Partial<User>): Promise<void> {
  const db = getDb();
  await db.update(users).set(changes).where(eq(users.accountId, accountId));
}

export async function findToken(token: string): Promise<Token | undefined> {
  const db = getDb();
  const result = await db.select().from(tokens).where(
    or(
      eq(tokens.accessToken, token),
      eq(tokens.refreshToken, token)
    )
  ).limit(1);
  return result[0];
}

export async function findTokenByAccountId(accountId: string): Promise<Token | undefined> {
  const db = getDb();
  const result = await db.select().from(tokens).where(eq(tokens.accountId, accountId)).limit(1);
  return result[0];
}

export async function upsertToken(accountId: string, data: Partial<Token>): Promise<void> {
  const db = getDb();
  const existing = await findTokenByAccountId(accountId);
  if (existing) {
    await db.update(tokens).set({ ...data, updatedAt: new Date() }).where(eq(tokens.accountId, accountId));
  } else {
    await db.insert(tokens).values({ accountId, ...data } as Token);
  }
}

export async function deleteToken(token: string): Promise<void> {
  const db = getDb();
  await db.delete(tokens).where(
    or(
      eq(tokens.accessToken, token),
      eq(tokens.refreshToken, token)
    )
  );
}

export async function findProfile(accountId: string, profileId?: string): Promise<Record<string, unknown> | undefined> {
  const db = getDb();
  const result = await db.select().from(profiles).where(eq(profiles.accountId, accountId)).limit(1);
  if (!result[0]) return undefined;
  
  const profilesData = result[0].profiles as Record<string, Record<string, unknown>>;
  if (profileId && profilesData[profileId]) {
    return profilesData[profileId];
  }
  
  return profilesData;
}

export async function createProfiles(accountId: string, username?: string): Promise<void> {
  const db = getDb();
  const profilesData: Record<string, unknown> = {};
  const defaultProfilesPath = path.join(process.cwd(), "static", "profiles");
  
  const files = fs.readdirSync(defaultProfilesPath);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    
    const filePath = path.join(defaultProfilesPath, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    
    data.accountId = accountId;
    data.created = new Date().toISOString();
    data.updated = new Date().toISOString();
    
    if (data.profileId) {
      profilesData[data.profileId] = data;
    }
  }
  
  await db.insert(profiles).values({ accountId, profiles: profilesData })
    .onConflictDoUpdate({
      target: profiles.accountId,
      set: { profiles: profilesData }
    });
}

export async function saveProfile(accountId: string, profileId: string, changes: Record<string, unknown>): Promise<void> {
  const db = getDb();
  const existing = await findProfile(accountId);
  if (!existing) return;
  
  const updatedProfiles = { ...existing as Record<string, unknown> };
  updatedProfiles[profileId] = changes;
  
  await db.update(profiles).set({ profiles: updatedProfiles }).where(eq(profiles.accountId, accountId));
}

export async function findFriendsByAccountId(accountId: string): Promise<Friends | undefined> {
  const db = getDb();
  const result = await db.select().from(friends).where(eq(friends.accountId, accountId)).limit(1);
  return result[0];
}

export async function createFriends(accountId: string): Promise<void> {
  const db = getDb();
  await db.insert(friends).values({
    accountId,
    accepted: [],
    incoming: [],
    outgoing: [],
    blocked: []
  }).onConflictDoNothing();
}

export async function saveFriends(accountId: string, changes: Partial<Friends>): Promise<void> {
  const db = getDb();
  await db.update(friends).set(changes).where(eq(friends.accountId, accountId));
}

export async function findDeviceAuth(accountId: string, deviceId: string, secret: string): Promise<DeviceAuth | undefined> {
  const db = getDb();
  const result = await db.select().from(deviceAuths).where(
    and(
      eq(deviceAuths.accountId, accountId),
      eq(deviceAuths.deviceId, deviceId),
      eq(deviceAuths.secret, secret)
    )
  ).limit(1);
  return result[0];
}

export async function createDeviceAuth(deviceId: string, accountId: string, secret: string, userAgent: string, location: string, ipAddress: string): Promise<DeviceAuth> {
  const db = getDb();
  const now = new Date();
  const deviceAuth: typeof deviceAuths.$inferInsert = {
    deviceId,
    accountId,
    secret,
    userAgent,
    location,
    ipAddress,
    createdAt: now,
    updatedAt: now
  };
  
  await db.insert(deviceAuths).values(deviceAuth)
    .onConflictDoUpdate({
      target: [deviceAuths.accountId, deviceAuths.deviceId],
      set: { secret, userAgent, location, ipAddress, updatedAt: now }
    });
  
  return { ...deviceAuth, id: "" } as DeviceAuth;
}

export async function deleteDeviceAuth(accountId: string, deviceId: string): Promise<void> {
  const db = getDb();
  await db.delete(deviceAuths).where(
    and(
      eq(deviceAuths.accountId, accountId),
      eq(deviceAuths.deviceId, deviceId)
    )
  );
}

export async function findMatchmakingBySessionId(sessionId: string): Promise<Matchmaking | undefined> {
  const db = getDb();
  const result = await db.select().from(matchmaking).where(eq(matchmaking.sessionId, sessionId)).limit(1);
  return result[0];
}

export async function saveMatchmaking(data: typeof matchmaking.$inferInsert): Promise<void> {
  const db = getDb();
  await db.insert(matchmaking).values(data)
    .onConflictDoUpdate({
      target: matchmaking.accountId,
      set: {
        sessionId: data.sessionId,
        playlist: data.playlist,
        region: data.region,
        buildUniqueId: data.buildUniqueId,
        ip: data.ip,
        port: data.port
      }
    });
}

export async function getItemShopData(): Promise<ItemShop | undefined> {
  const db = getDb();
  const result = await db.select().from(itemShop).limit(1);
  return result[0];
}

export async function updateUserIp(accountId: string, ip: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ lastIp: ip }).where(eq(users.accountId, accountId));
}

export async function findUserByIp(ip: string): Promise<User | undefined> {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.lastIp, ip)).limit(1);
  return result[0];
}

export async function findUsersByIp(ip: string): Promise<User[]> {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.lastIp, ip));
  return result;
}

export async function isIpBanned(ip: string): Promise<boolean> {
  const db = getDb();
  const result = await db.select().from(bannedIps).where(eq(bannedIps.ip, ip)).limit(1);
  return result.length > 0;
}

export async function getBannedIp(ip: string): Promise<BannedIp | undefined> {
  const db = getDb();
  const result = await db.select().from(bannedIps).where(eq(bannedIps.ip, ip)).limit(1);
  return result[0];
}

export async function banIp(ip: string, reason?: string, bannedBy?: string): Promise<void> {
  const db = getDb();
  await db.insert(bannedIps).values({ ip, reason, bannedBy }).onConflictDoNothing();
}

export async function unbanIp(ip: string): Promise<boolean> {
  const db = getDb();
  const result = await db.delete(bannedIps).where(eq(bannedIps.ip, ip));
  return true;
}

export async function getAllBannedIps(): Promise<BannedIp[]> {
  const db = getDb();
  const result = await db.select().from(bannedIps);
  return result;
}

export async function deleteUser(accountId: string): Promise<boolean> {
  const db = getDb();
  // Delete all related data
  await db.delete(tokens).where(eq(tokens.accountId, accountId));
  await db.delete(profiles).where(eq(profiles.accountId, accountId));
  await db.delete(friends).where(eq(friends.accountId, accountId));
  await db.delete(deviceAuths).where(eq(deviceAuths.accountId, accountId));
  // Delete the user
  await db.delete(users).where(eq(users.accountId, accountId));
  return true;
}

export async function updateArenaHype(accountId: string, hype: number, division: number): Promise<void> {
  const db = getDb();
  await db.update(users).set({ arenaHype: hype, arenaDivision: division }).where(eq(users.accountId, accountId));
}

export async function addArenaHype(accountId: string, amount: number): Promise<{ hype: number; division: number } | null> {
  const db = getDb();
  const user = await findUserByAccountId(accountId);
  if (!user) return null;
  
  const newHype = Math.max(0, (user.arenaHype || 0) + amount);

  let division = 1;
  if (newHype >= 25000) division = 10;
  else if (newHype >= 19000) division = 9;
  else if (newHype >= 14000) division = 8;
  else if (newHype >= 10000) division = 7;
  else if (newHype >= 6500) division = 6;
  else if (newHype >= 4500) division = 5;
  else if (newHype >= 3000) division = 4;
  else if (newHype >= 2000) division = 3;
  else if (newHype >= 1000) division = 2;
  else if (newHype >= 500) division = 1;
  
  await db.update(users).set({ arenaHype: newHype, arenaDivision: division }).where(eq(users.accountId, accountId));
  return { hype: newHype, division };
}

export async function resetAllArenaHype(): Promise<void> {
  const db = getDb();
  await db.update(users).set({ arenaHype: 0, arenaDivision: 1 });
}

export async function updateUserDiscordId(accountId: string, discordId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ discordId }).where(eq(users.accountId, accountId));
}

export async function findUserByDiscordId(discordId: string): Promise<User | undefined> {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.discordId, discordId)).limit(1);
  return result[0];
}
