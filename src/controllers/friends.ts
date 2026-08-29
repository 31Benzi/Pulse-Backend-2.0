import type { Context } from "hono";
import { findUserByAccountId, findFriendsByAccountId, createFriends, saveFriends } from "../db/queries";
import { sendError } from "../utils/helpers";
import { broadcastFriendEvent, sendPresenceFromUser } from "../sockets";
import type { FriendEntry } from "../db/schema/friends";

async function ensureFriends(accountId: string) {
  let doc = await findFriendsByAccountId(accountId);
  if (!doc) {
    await createFriends(accountId);
    doc = await findFriendsByAccountId(accountId);
  }
  return doc;
}

export async function getFriends(c: Context) {
  const accountId = c.req.param("accountId");
  const friendsDoc = await findFriendsByAccountId(accountId);

  if (!friendsDoc) {
    return c.json([]);
  }

  const response: Record<string, unknown>[] = [];

  for (const friend of friendsDoc.accepted) {
    response.push({
      accountId: friend.accountId,
      status: "ACCEPTED",
      direction: "OUTBOUND",
      favorite: false,
      created: friend.created
    });
  }

  for (const friend of friendsDoc.outgoing) {
    response.push({
      accountId: friend.accountId,
      status: "PENDING",
      direction: "OUTBOUND",
      favorite: false,
      created: friend.created
    });
  }

  for (const friend of friendsDoc.incoming) {
    response.push({
      accountId: friend.accountId,
      status: "PENDING",
      direction: "INBOUND",
      favorite: false,
      created: friend.created
    });
  }

  return c.json(response);
}

export async function getFriendsSummary(c: Context) {
  const accountId = c.req.param("accountId");
  const friendsDoc = await findFriendsByAccountId(accountId);

  if (!friendsDoc) {
    return c.json({
      friends: [],
      incoming: [],
      outgoing: [],
      suggested: [],
      blocklist: [],
      settings: { acceptInvites: "public" }
    });
  }

  const friendsList: Record<string, unknown>[] = [];
  for (const friend of friendsDoc.accepted) {
    friendsList.push({
      accountId: friend.accountId,
      groups: [],
      mutual: 0,
      alias: friend.alias || "",
      note: "",
      favorite: false,
      created: friend.created
    });
  }

  const incomingList: Record<string, unknown>[] = [];
  for (const friend of friendsDoc.incoming) {
    incomingList.push({
      accountId: friend.accountId,
      mutual: 0,
      favorite: false,
      created: friend.created
    });
  }

  const outgoingList: Record<string, unknown>[] = [];
  for (const friend of friendsDoc.outgoing) {
    outgoingList.push({
      accountId: friend.accountId,
      favorite: false,
      created: friend.created
    });
  }

  const blocklist: Record<string, unknown>[] = [];
  for (const friend of friendsDoc.blocked) {
    blocklist.push({
      accountId: friend.accountId
    });
  }

  return c.json({
    friends: friendsList,
    incoming: incomingList,
    outgoing: outgoingList,
    suggested: [],
    blocklist,
    settings: { acceptInvites: "public" }
  });
}

export async function getBlocklist(c: Context) {
  const accountId = c.req.param("accountId");
  const friendsDoc = await findFriendsByAccountId(accountId);
  if (!friendsDoc) return c.json({ blockedUsers: [] });

  return c.json({
    blockedUsers: friendsDoc.blocked.map((f: FriendEntry) => f.accountId)
  });
}

export async function addFriend(c: Context) {
  const accountId = c.req.param("accountId");
  const friendId = c.req.param("friendId");

  if (accountId === friendId) {
    return sendError(c, "errors.com.exlo.friends.self_friend", "You cannot friend yourself", [], 14004, null, 400);
  }

  const user = await findUserByAccountId(accountId);
  const friendUser = await findUserByAccountId(friendId);

  if (!user || !friendUser) {
    return sendError(c, "errors.com.exlo.friends.user_not_found", "User not found", [], 14004, null, 404);
  }

  const senderFriends = await ensureFriends(accountId);
  const receiverFriends = await ensureFriends(friendId);

  if (!senderFriends || !receiverFriends) {
    return sendError(c, "errors.com.exlo.friends.error", "Failed to initialize friend lists", [], 14000, null, 500);
  }

  if (senderFriends.blocked.some((f: FriendEntry) => f.accountId === friendId) ||
      receiverFriends.blocked.some((f: FriendEntry) => f.accountId === accountId)) {
    return sendError(c, "errors.com.exlo.friends.blocked", "User is blocked", [], 14004, null, 403);
  }

  if (senderFriends.accepted.some((f: FriendEntry) => f.accountId === friendId)) {
    return sendError(c, "errors.com.exlo.friends.already_friends", "You are already friends with this user", [], 14014, null, 409);
  }

  if (senderFriends.outgoing.some((f: FriendEntry) => f.accountId === friendId)) {
    return sendError(c, "errors.com.exlo.friends.request_already_sent", "Friend request already sent", [], 14014, null, 409);
  }

  const now = new Date().toISOString();
  const hasIncoming = senderFriends.incoming.some((f: FriendEntry) => f.accountId === friendId);

  if (hasIncoming) {
    senderFriends.incoming = senderFriends.incoming.filter((f: FriendEntry) => f.accountId !== friendId);
    receiverFriends.outgoing = receiverFriends.outgoing.filter((f: FriendEntry) => f.accountId !== accountId);

    senderFriends.accepted.push({ accountId: friendId, created: now });
    receiverFriends.accepted.push({ accountId, created: now });

    await saveFriends(accountId, { accepted: senderFriends.accepted, incoming: senderFriends.incoming });
    await saveFriends(friendId, { accepted: receiverFriends.accepted, outgoing: receiverFriends.outgoing });

    broadcastFriendEvent(accountId, friendId, "ACCEPTED", "OUTBOUND");
    broadcastFriendEvent(friendId, accountId, "ACCEPTED", "INBOUND");

    sendPresenceFromUser(accountId, friendId, false);
    sendPresenceFromUser(friendId, accountId, false);

    return c.body(null, 204);
  }

  senderFriends.outgoing.push({ accountId: friendId, created: now });
  receiverFriends.incoming.push({ accountId, created: now });

  await saveFriends(accountId, { outgoing: senderFriends.outgoing });
  await saveFriends(friendId, { incoming: receiverFriends.incoming });

  broadcastFriendEvent(accountId, friendId, "PENDING", "OUTBOUND");
  broadcastFriendEvent(friendId, accountId, "PENDING", "INBOUND");

  return c.body(null, 204);
}

export async function removeFriend(c: Context) {
  const accountId = c.req.param("accountId");
  const friendId = c.req.param("friendId");

  const senderFriends = await findFriendsByAccountId(accountId);
  const receiverFriends = await findFriendsByAccountId(friendId);

  if (!senderFriends || !receiverFriends) {
    return c.body(null, 204);
  }

  const wasAccepted = senderFriends.accepted.some((f: FriendEntry) => f.accountId === friendId);

  senderFriends.accepted = senderFriends.accepted.filter((f: FriendEntry) => f.accountId !== friendId);
  senderFriends.incoming = senderFriends.incoming.filter((f: FriendEntry) => f.accountId !== friendId);
  senderFriends.outgoing = senderFriends.outgoing.filter((f: FriendEntry) => f.accountId !== friendId);

  receiverFriends.accepted = receiverFriends.accepted.filter((f: FriendEntry) => f.accountId !== accountId);
  receiverFriends.incoming = receiverFriends.incoming.filter((f: FriendEntry) => f.accountId !== accountId);
  receiverFriends.outgoing = receiverFriends.outgoing.filter((f: FriendEntry) => f.accountId !== accountId);

  await saveFriends(accountId, {
    accepted: senderFriends.accepted,
    incoming: senderFriends.incoming,
    outgoing: senderFriends.outgoing
  });
  await saveFriends(friendId, {
    accepted: receiverFriends.accepted,
    incoming: receiverFriends.incoming,
    outgoing: receiverFriends.outgoing
  });

  broadcastFriendEvent(accountId, friendId, wasAccepted ? "DELETED" : "ABORTED", "OUTBOUND");
  broadcastFriendEvent(friendId, accountId, wasAccepted ? "DELETED" : "ABORTED", "INBOUND");

  if (wasAccepted) {
    sendPresenceFromUser(accountId, friendId, true);
    sendPresenceFromUser(friendId, accountId, true);
  }

  return c.body(null, 204);
}

export async function blockFriend(c: Context) {
  const accountId = c.req.param("accountId");
  const friendId = c.req.param("friendId");

  if (accountId === friendId) return c.body(null, 403);

  const senderFriends = await ensureFriends(accountId);
  const receiverFriends = await ensureFriends(friendId);

  if (!senderFriends || !receiverFriends) return c.body(null, 403);

  senderFriends.accepted = senderFriends.accepted.filter((f: FriendEntry) => f.accountId !== friendId);
  senderFriends.incoming = senderFriends.incoming.filter((f: FriendEntry) => f.accountId !== friendId);
  senderFriends.outgoing = senderFriends.outgoing.filter((f: FriendEntry) => f.accountId !== friendId);

  receiverFriends.accepted = receiverFriends.accepted.filter((f: FriendEntry) => f.accountId !== accountId);
  receiverFriends.incoming = receiverFriends.incoming.filter((f: FriendEntry) => f.accountId !== accountId);
  receiverFriends.outgoing = receiverFriends.outgoing.filter((f: FriendEntry) => f.accountId !== accountId);

  if (!senderFriends.blocked.some((f: FriendEntry) => f.accountId === friendId)) {
    senderFriends.blocked.push({ accountId: friendId, created: new Date().toISOString() });
  }

  await saveFriends(accountId, {
    accepted: senderFriends.accepted,
    incoming: senderFriends.incoming,
    outgoing: senderFriends.outgoing,
    blocked: senderFriends.blocked
  });
  await saveFriends(friendId, {
    accepted: receiverFriends.accepted,
    incoming: receiverFriends.incoming,
    outgoing: receiverFriends.outgoing
  });

  sendPresenceFromUser(accountId, friendId, true);
  sendPresenceFromUser(friendId, accountId, true);

  return c.body(null, 204);
}

export async function unblockFriend(c: Context) {
  const accountId = c.req.param("accountId");
  const friendId = c.req.param("friendId");

  const senderFriends = await findFriendsByAccountId(accountId);
  if (!senderFriends) return c.body(null, 204);

  senderFriends.blocked = senderFriends.blocked.filter((f: FriendEntry) => f.accountId !== friendId);
  await saveFriends(accountId, { blocked: senderFriends.blocked });

  return c.body(null, 204);
}

export async function friendsRecent(c: Context) {
  return c.json([]);
}

export async function friendsSettings(c: Context) {
  return c.json({ acceptInvites: "public" });
}

export async function getFriendAlias(c: Context) {
  const accountId = c.req.param("accountId");
  const friendId = c.req.param("friendId");
  const friendsDoc = await findFriendsByAccountId(accountId);
  if (!friendsDoc) return c.json({ note: "", alias: "" });

  const friend = friendsDoc.accepted.find((f: FriendEntry) => f.accountId === friendId);
  return c.json({ note: "", alias: friend?.alias || "" });
}

export async function setFriendAlias(c: Context) {
  const accountId = c.req.param("accountId");
  const friendId = c.req.param("friendId");

  const rawBody = await c.req.text();
  const allowed = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  for (const ch of rawBody) {
    if (!allowed.includes(ch)) {
      return sendError(
        c,
        "errors.com.epicgames.validation.validation_failed",
        "Validation Failed. Invalid fields were [alias]",
        ["[alias]"],
        1040,
        null,
        400
      );
    }
  }

  if (rawBody.length < 3 || rawBody.length > 16) {
    return sendError(
      c,
      "errors.com.epicgames.validation.validation_failed",
      "Validation Failed. Invalid fields were [alias]",
      ["[alias]"],
      1040,
      null,
      400
    );
  }

  const friendsDoc = await findFriendsByAccountId(accountId);
  if (!friendsDoc) return c.body(null, 204);

  const idx = friendsDoc.accepted.findIndex((f: FriendEntry) => f.accountId === friendId);
  if (idx === -1) {
    return sendError(
      c,
      "errors.com.epicgames.friends.friendship_not_found",
      `Friendship between ${accountId} and ${friendId} does not exist`,
      [accountId, friendId],
      14004,
      null,
      404
    );
  }

  friendsDoc.accepted[idx].alias = rawBody;
  await saveFriends(accountId, { accepted: friendsDoc.accepted });

  return c.body(null, 204);
}

export async function deleteFriendAlias(c: Context) {
  const accountId = c.req.param("accountId");
  const friendId = c.req.param("friendId");

  const friendsDoc = await findFriendsByAccountId(accountId);
  if (!friendsDoc) return c.body(null, 204);

  const idx = friendsDoc.accepted.findIndex((f: FriendEntry) => f.accountId === friendId);
  if (idx !== -1) {
    friendsDoc.accepted[idx].alias = "";
    await saveFriends(accountId, { accepted: friendsDoc.accepted });
  }

  return c.body(null, 204);
}

