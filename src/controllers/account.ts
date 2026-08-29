import type { Context } from "hono";
import { findUserByAccountId, findUserByUsername, findUsersByUsername, findUsersByAccountIds } from "../db/queries";
import { sendError, logger } from "../utils/helpers";

export async function accountDetails(c: Context) {
  const accountId = c.req.param("accountId");
  if (!accountId) {
    return c.body(null, 400);
  }

  const user = await findUserByAccountId(accountId);
  if (!user || user.banned) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Sorry we couldn't find an account for ${accountId}`, [accountId], 18007, null, 404);
  }

  return c.json({
    id: accountId,
    displayName: user.username,
    username: user.username,
    name: user.username,
    email: user.email,
    failedLoginAttempts: 0,
    lastLogin: new Date().toISOString(),
    numberOfDisplayNameChanges: 0,
    ageGroup: "UNKNOWN",
    headless: false,
    country: "RO",
    lastName: user.username,
    preferredLanguage: "en",
    canUpdateDisplayName: false,
    tfaEnabled: false,
    emailVerified: true,
    minorVerified: false,
    minorExpected: false,
    minorStatus: "NOT_MINOR",
    cabinedMode: false,
    hasHashedEmail: false
  });
}

export async function queryFetch(c: Context) {
  const response: Record<string, unknown>[] = [];

  let accountIds = c.req.queries("accountId") || [];
  if (accountIds.length === 0) {
    const single = c.req.query("accountId");
    if (single) {
      accountIds = [single];
    } else {
      return c.body(null, 400);
    }
  }

  for (const id of accountIds) {
    const user = await findUserByAccountId(id);
    response.push({
      id,
      displayName: user?.username || "",
      externalAuths: {}
    });
  }

  return c.json(response);
}

export async function displayNameFetch(c: Context) {
  const displayName = c.req.param("displayName");
  if (!displayName) {
    return c.body(null, 400);
  }

  const user = await findUserByUsername(displayName);
  if (!user || user.banned) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Sorry we couldn't find an account for ${displayName}`, [displayName], 18007, null, 404);
  }

  return c.json({
    id: user.accountId,
    displayName: user.username,
    externalAuths: {}
  });
}

export async function searchUsers(c: Context) {
  const accountId = c.req.param("accountId");
  if (!accountId) {
    return c.body(null, 400);
  }

  const prefix = c.req.query("prefix");
  if (!prefix) {
    return c.body(null, 400);
  }

  const users = await findUsersByUsername(prefix);
  if (users.length === 0) {
    return c.json([]);
  }

  const response = users.map((user, i) => ({
    accountId: user.accountId,
    matches: [{
      value: user.username,
      platform: "epic"
    }],
    matchType: user.username.toLowerCase() === prefix.toLowerCase() ? "exact" : "prefix",
    epicMutuals: 0,
    sortPosition: i
  }));

  return c.json(response);
}

export async function sdkAccounts(c: Context) {
  const accountId = c.req.param("accountId");

  const user = await findUserByAccountId(accountId);
  if (!user || user.banned) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Sorry we couldn't find an account for ${accountId}`, [accountId], 18007, null, 404);
  }

  return c.json([{
    accountId: user.accountId,
    displayName: user.username,
    preferredLanguage: "en",
    cabinedMode: false,
    empty: false
  }]);
}

export async function statsProxy(c: Context) {
  const accountId = c.req.param("accountId");
  return c.json({
    startTime: 0,
    endTime: 0,
    stats: {},
    accountId
  });
}

export async function getContentControls(c: Context) {
  const accountId = c.req.param("accountId");
  return c.json({
    data: {
      ageGate: 0,
      controlsEnabled: false,
      maxEpicProfilePrivacy: "none",
      principalId: accountId
    }
  });
}

export async function contentControlsPin(c: Context) {
  return c.json({
    data: {
      pinCorrect: true
    }
  });
}

export async function privacy(c: Context) {
  const accountId = c.req.param("accountId");
  return c.json({
    accountId,
    optOutOfPublicLeaderboards: false
  });
}

export async function brInventory(c: Context) {
  return c.json({
    stash: {
      globalcash: 0
    }
  });
}

export async function socialBan(c: Context) {
  return c.json({
    bans: [],
    warning: []
  });
}
