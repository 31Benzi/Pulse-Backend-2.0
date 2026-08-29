import type { Context } from "hono";
import { findMatchmakingBySessionId, saveMatchmaking, findUserByAccountId } from "../db/queries";
import { generateUuid, logger } from "../utils/helpers";

const regionSubregionMap: Record<string, string> = {
  EU: "GB",
  NA: "VA",
  NAE: "VA",
  NAW: "CA",
  OCE: "AU",
  BR: "BR",
  ASIA: "JP",
};

export async function createMatchmakingTicket(c: Context) {
  const accountId = c.req.param("accountId");

  const user = await findUserByAccountId(accountId);
  if (!user || user.isServer || !user.matchmakingId) {
    return c.body(null, 403);
  }

  const bucketId = c.req.query("bucketId") || "";
  const parts = bucketId.split(":");
  if (parts.length !== 4) {
    return c.body(null, 400);
  }

  const buildUniqueId = parts[0];
  const region = parts[2];
  const playlist = parts[3];

  const sessionId = generateUuid().replace(/-/g, "");

  await saveMatchmaking({
    accountId: user.accountId,
    sessionId,
    playlist,
    region,
    buildUniqueId,
    ip: "",
    port: 0
  });

  const matchmakerIP = process.env.MATCHMAKER_IP || "127.0.0.1:8080";
  const serviceUrl = matchmakerIP.startsWith("ws://") ? matchmakerIP : `ws://${matchmakerIP}`;

  return c.json({
    serviceUrl,
    ticketType: "mms-player",
    payload: user.matchmakingId,
    signature: "account"
  });
}

export async function getMatchmakingTicket(c: Context) {
  return c.body(null, 204);
}

export async function deleteMatchmakingTicket(c: Context) {
  const accountId = c.req.param("accountId");
  logger.info(`[Matchmaking] Player ${accountId} removed from queue`);
  return c.body(null, 204);
}

export async function getMatchmakingSession(c: Context) {
  const sessionId = c.req.param("sessionId");
  const accountId = c.req.param("accountId");

  if (accountId && sessionId) {
    return c.json({
      accountId,
      sessionId,
      key: "none"
    });
  }

  const sessionData = await findMatchmakingBySessionId(sessionId);

  if (!sessionData) {
    return c.json({
      errorCode: "errors.com.exlo.matchmaking.store_not_found",
      errorMessage: `No matchmaking store found for session ${sessionId}`,
      messageVars: [sessionId],
      numericErrorCode: 404,
      originatingService: "matchmaking",
      intent: "prod"
    }, 404);
  }

  return c.json({
    id: sessionId,
    ownerId: generateUuid().replace(/-/g, "").toUpperCase(),
    ownerName: "[DS]fortnite-live",
    serverName: "[DS]fortnite-live",
    serverAddress: sessionData.ip || process.env.MATCHMAKER_IP || "127.0.0.1",
    serverPort: sessionData.port || 8081,
    maxPublicPlayers: 220,
    openPublicPlayers: 175,
    maxPrivatePlayers: 0,
    openPrivatePlayers: 0,
    attributes: {
      REGION_s: sessionData.region,
      GAMEMODE_s: "FORTATHENA",
      ALLOWBROADCASTING_b: true,
      SUBREGION_s: regionSubregionMap[(sessionData.region || "").toUpperCase()] || "VA",
      DCID_s: "FORTNITE-LIVE",
      tenant_s: "Fortnite",
      MATCHMAKINGPOOL_s: "Any",
      STORMSHIELDDEFENSETYPE_i: 0,
      HOTFIXVERSION_i: 0,
      PLAYLISTNAME_s: sessionData.playlist,
      SESSIONKEY_s: generateUuid().replace(/-/g, "").toUpperCase(),
      TENANT_s: "Fortnite",
      BEACONPORT_i: 15009
    },
    publicPlayers: [],
    privatePlayers: [],
    totalPlayers: 45,
    allowJoinInProgress: false,
    shouldAdvertise: false,
    isDedicated: false,
    usesStats: false,
    allowInvites: false,
    usesPresence: false,
    allowJoinViaPresence: true,
    allowJoinViaPresenceFriendsOnly: false,
    buildUniqueId: sessionData.buildUniqueId,
    lastUpdated: new Date().toISOString(),
    started: false
  });
}

export async function joinSession(c: Context) {
  return c.body(null, 204);
}

export async function leaveSession(c: Context) {
  return c.body(null, 204);
}

export async function updateSession(c: Context) {
  return c.body(null, 204);
}

export async function findSessions(c: Context) {
  return c.json([]);
}

export async function getWaitTimes(c: Context) {
  return c.json([
    {
      playlistId: "Playlist_DefaultSolo",
      averageWaitTimeSecs: 5,
      numPlayers: 100
    },
    {
      playlistId: "Playlist_DefaultDuo",
      averageWaitTimeSecs: 5,
      numPlayers: 100
    },
    {
      playlistId: "Playlist_DefaultSquad",
      averageWaitTimeSecs: 5,
      numPlayers: 100
    },
    {
      playlistId: "Playlist_1V1",
      averageWaitTimeSecs: 5,
      numPlayers: 16
    }
  ]);
}
