import type { Context } from "hono";
import { findUserByAccountId, findFriendsByAccountId } from "../db/queries";
import { generateUuid, sendXmppMessage, sendError, getVersionInfo, logger } from "../utils/helpers";
import type { Party, PartyMember } from "../types";
import type { FriendEntry } from "../db/schema/friends";

interface PartyInvite {
  party_id: string;
  sent_by: string;
  sent_to: string;
  sent_at: string;
  updated_at: string;
  expires_at: string;
  status: string;
  meta: Record<string, unknown>;
}

interface PartyIntention {
  requester_id: string;
  requester_dn: string;
  requester_pl: string;
  requester_pl_dn: string;
  requestee_id: string;
  meta: Record<string, unknown>;
  expires_at: string;
  sent_at: string;
}

interface Ping {
  sent_by: string;
  sent_to: string;
  sent_at: string;
  expires_at: string;
  meta: Record<string, unknown>;
}

const parties: Map<string, Party> = new Map();
const memberToParty: Map<string, string> = new Map();
const pings: Ping[] = [];

function buildMember(accountId: string, displayName: string, role: string, body: Record<string, unknown> = {}): PartyMember {
  const now = new Date().toISOString();
  const connection = (body.connection as Record<string, unknown>) || {};
  const connMeta = (connection.meta as Record<string, unknown>) || {};
  const connId = typeof connection.id === "string" ? connection.id : generateUuid();

  return {
    account_id: accountId,
    role,
    joined_at: now,
    updated_at: now,
    revision: 0,
    connections: [
      {
        id: connId,
        connected_at: now,
        updated_at: now,
        yield_leadership: !!connection.yield_leadership,
        meta: connMeta
      }
    ],
    meta: (body.meta as Record<string, unknown>) || { "urn:epic:member:dn_s": displayName }
  };
}

function broadcastPartyUpdated(
  party: Party,
  updated: Record<string, unknown>,
  deleted: string[]
) {
  const captain = party.members.find(m => m.role === "CAPTAIN");
  const now = new Date().toISOString();
  for (const member of party.members) {
    sendXmppMessage(member.account_id, {
      captain_id: captain?.account_id,
      created_at: party.created_at,
      invite_ttl_seconds: (party.config as Record<string, unknown>).invite_ttl || 14400,
      max_number_of_members: (party.config as Record<string, unknown>).max_size || 16,
      ns: "Fortnite",
      party_id: party.id,
      party_privacy_type: (party.config as Record<string, unknown>).joinability,
      party_state_overriden: {},
      party_state_removed: deleted,
      party_state_updated: updated,
      party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
      party_type: "DEFAULT",
      revision: party.revision,
      sent: now,
      type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
      updated_at: now
    });
  }
}

function updateRawSquadAssignmentsOnJoin(party: Party, accountId: string): Record<string, unknown> {
  const key = party.meta["Default:RawSquadAssignments_j"]
    ? "Default:RawSquadAssignments_j"
    : "RawSquadAssignments_j";

  if (!party.meta[key] || typeof party.meta[key] !== "string") return {};

  try {
    const rsa = JSON.parse(party.meta[key] as string);
    if (!rsa.RawSquadAssignments) rsa.RawSquadAssignments = [];
    rsa.RawSquadAssignments.push({
      memberId: accountId,
      absoluteMemberIdx: party.members.length - 1
    });
    party.meta[key] = JSON.stringify(rsa);
    return { [key]: party.meta[key] };
  } catch {
    return {};
  }
}

function updateRawSquadAssignmentsOnLeave(party: Party, accountId: string): Record<string, unknown> {
  const key = party.meta["Default:RawSquadAssignments_j"]
    ? "Default:RawSquadAssignments_j"
    : "RawSquadAssignments_j";

  if (!party.meta[key] || typeof party.meta[key] !== "string") return {};

  try {
    const rsa = JSON.parse(party.meta[key] as string);
    const idx = (rsa.RawSquadAssignments || []).findIndex((a: { memberId: string }) => a.memberId === accountId);
    if (idx !== -1) rsa.RawSquadAssignments.splice(idx, 1);
    party.meta[key] = JSON.stringify(rsa);
    return { [key]: party.meta[key] };
  } catch {
    return {};
  }
}

export async function getUserParties(c: Context) {
  const accountId = c.req.param("accountId") || c.get("accountId");

  const partyId = memberToParty.get(accountId);
  const party = partyId ? parties.get(partyId) : undefined;

  logger.info(`[party] getUserParties: accountId=${accountId} currentPartyId=${party?.id || "none"} size=${party?.members.length ?? 0}`);

  return c.json({
    current: party ? [party] : [],
    pending: [],
    invites: [],
    pings: pings.filter(p => p.sent_to === accountId)
  });
}

export async function partyUndeliveredCount(c: Context) {
  const accountId = c.req.param("accountId");
  const partyId = memberToParty.get(accountId);
  const party = partyId ? parties.get(partyId) : undefined;

  return c.json({
    pings: pings.filter(p => p.sent_to === accountId).length,
    invites: party ? (party.invites as PartyInvite[]).filter(i => i.sent_to === accountId).length : 0
  });
}

export async function createParty(c: Context) {
  const accountId = c.get("accountId") || c.req.param("accountId");
  const user = await findUserByAccountId(accountId);
  const displayName = user?.username || "Player";

  const body = await c.req.json().catch(() => ({}));
  if (!body.join_info || !body.join_info.connection) return c.json({});

  logger.info(`[party] createParty: accountId=${accountId} displayName=${displayName}`);

  const oldPartyId = memberToParty.get(accountId);
  if (oldPartyId) {
    const oldParty = parties.get(oldPartyId);
    if (oldParty) {
      oldParty.members = oldParty.members.filter(m => m.account_id !== accountId);
      if (oldParty.members.length === 0) parties.delete(oldPartyId);
    }
  }

  const partyId = generateUuid();
  const now = new Date().toISOString();

  const member = buildMember(accountId, displayName, "CAPTAIN", {
    connection: body.join_info.connection,
    meta: body.join_info.meta
  });

  const party: Party = {
    id: partyId,
    created_at: now,
    updated_at: now,
    config: body.config || {
      type: "DEFAULT",
      joinability: "OPEN",
      discoverability: "ALL",
      sub_type: "default",
      max_size: 16,
      invite_ttl: 14400,
      join_confirmation: false,
      intention_ttl: 60,
      chat_enabled: true
    },
    members: [member],
    applicants: [],
    meta: body.meta || {},
    invites: [],
    revision: 0,
    intentions: []
  };

  parties.set(partyId, party);
  memberToParty.set(accountId, partyId);

  return c.json(party, 201);
}

export async function getParty(c: Context) {
  const partyId = c.req.param("partyId");
  const party = parties.get(partyId);

  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  return c.json(party);
}

export async function updateParty(c: Context) {
  const partyId = c.req.param("partyId");
  const requesterId = c.get("accountId");
  const party = parties.get(partyId);

  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  const editingMember = party.members.find(m => m.account_id === requesterId);
  if (editingMember && editingMember.role !== "CAPTAIN") {
    return sendError(c, "errors.com.epicgames.social.party.unauthorized", `User ${requesterId} is not allowed to edit party ${partyId}`, [requesterId, partyId], 51015, null, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const deletedKeys: string[] = [];
  const updatedKeys: Record<string, unknown> = {};

  if (body.config && typeof body.config === "object") {
    party.config = { ...(party.config as Record<string, unknown>), ...body.config };
  }

  if (body.meta) {
    if (Array.isArray(body.meta.delete)) {
      for (const key of body.meta.delete) {
        delete party.meta[key];
        deletedKeys.push(key);
      }
    }
    if (body.meta.update && typeof body.meta.update === "object") {
      for (const key of Object.keys(body.meta.update)) {
        party.meta[key] = body.meta.update[key];
        updatedKeys[key] = body.meta.update[key];
      }
    }
  }

  party.revision++;
  party.updated_at = new Date().toISOString();

  broadcastPartyUpdated(party, updatedKeys, deletedKeys);

  return c.body(null, 204);
}

export async function deleteParty(c: Context) {
  const partyId = c.req.param("partyId");
  const party = parties.get(partyId);

  if (!party) return c.body(null, 204);

  for (const member of party.members) {
    memberToParty.delete(member.account_id);
    sendXmppMessage(member.account_id, {
      type: "com.epicgames.social.party.notification.v0.PARTY_DISBANDED",
      party_id: partyId,
      ns: "Fortnite",
      sent: new Date().toISOString()
    });
  }

  parties.delete(partyId);
  return c.body(null, 204);
}

export async function joinParty(c: Context) {
  const partyId = c.req.param("partyId");
  const accountId = c.req.param("accountId");
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const party = parties.get(partyId);
  if (!party) {
    logger.warn(`[party] join: party ${partyId} not found for accountId=${accountId}`);
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  logger.info(`[party] join: accountId=${accountId} joining partyId=${partyId} (size=${party.members.length}/${(party.config as Record<string, unknown>).max_size})`);

  const existingMember = party.members.find(m => m.account_id === accountId);
  if (existingMember) {
    logger.info(`[party] join: ${accountId} already a member of ${partyId}, resending MEMBER_JOINED+PARTY_UPDATED`);

    const reConnection = body?.connection as Record<string, unknown> | undefined;
    const reConnMeta = (reConnection?.meta as Record<string, unknown>) || (existingMember.connections[0]?.meta as Record<string, unknown>) || {};
    const reConnId = (reConnection?.id as string) || existingMember.connections[0]?.id || "";
    const reNow = new Date().toISOString();
    const reCaptain = party.members.find(m => m.role === "CAPTAIN");

    if (reConnection) {
      existingMember.connections[0] = {
        id: reConnId,
        connected_at: reNow,
        updated_at: reNow,
        yield_leadership: !!reConnection.yield_leadership,
        meta: reConnMeta
      };
      existingMember.updated_at = reNow;
    }

    for (const m of party.members) {
      sendXmppMessage(m.account_id, {
        account_dn: reConnMeta["urn:epic:member:dn_s"] || existingMember.meta["urn:epic:member:dn_s"] || "Player",
        account_id: accountId,
        connection: {
          connected_at: reNow,
          id: reConnId,
          meta: reConnMeta,
          updated_at: reNow
        },
        joined_at: existingMember.joined_at,
        member_state_updated: existingMember.meta,
        ns: "Fortnite",
        party_id: partyId,
        revision: 0,
        sent: reNow,
        type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
        updated_at: reNow
      });

      sendXmppMessage(m.account_id, {
        captain_id: reCaptain?.account_id || "",
        created_at: party.created_at,
        invite_ttl_seconds: (party.config as Record<string, unknown>).invite_ttl || 14400,
        max_number_of_members: (party.config as Record<string, unknown>).max_size || 16,
        ns: "Fortnite",
        party_id: partyId,
        party_privacy_type: (party.config as Record<string, unknown>).joinability,
        party_state_overriden: {},
        party_state_removed: [],
        party_state_updated: {},
        party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
        party_type: "DEFAULT",
        revision: party.revision,
        sent: reNow,
        type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
        updated_at: reNow
      });
    }

    return c.json({ status: "JOINED", party_id: partyId });
  }

  const oldPartyId = memberToParty.get(accountId);
  if (oldPartyId && oldPartyId !== partyId) {
    const oldParty = parties.get(oldPartyId);
    if (oldParty) {
      const wasCaptain = oldParty.members.find(m => m.account_id === accountId)?.role === "CAPTAIN";
      const leftAt = new Date().toISOString();

      for (const om of oldParty.members) {
        sendXmppMessage(om.account_id, {
          account_id: accountId,
          member_state_update: {},
          ns: "Fortnite",
          party_id: oldPartyId,
          revision: oldParty.revision || 0,
          sent: leftAt,
          type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT"
        });
      }

      oldParty.members = oldParty.members.filter(m => m.account_id !== accountId);

      if (oldParty.members.length === 0) {
        parties.delete(oldPartyId);
      } else if (wasCaptain) {
        oldParty.members[0].role = "CAPTAIN";
        const newCap = oldParty.members[0];
        for (const om of oldParty.members) {
          sendXmppMessage(om.account_id, {
            account_id: newCap.account_id,
            member_state_update: {},
            ns: "Fortnite",
            party_id: oldPartyId,
            revision: oldParty.revision || 0,
            sent: leftAt,
            type: "com.epicgames.social.party.notification.v0.MEMBER_NEW_CAPTAIN"
          });
        }
      }
    }
  }

  const connection = (body.connection as Record<string, unknown>) || {};
  const connId = typeof connection.id === "string" ? connection.id : "";
  const connMeta = (connection.meta as Record<string, unknown>) || {};
  const memberMeta = (body.meta as Record<string, unknown>) || {};

  const member: PartyMember = {
    account_id: accountId,
    role: connection.yield_leadership ? "CAPTAIN" : "MEMBER",
    joined_at: now,
    updated_at: now,
    revision: 0,
    connections: [
      {
        id: connId,
        connected_at: now,
        updated_at: now,
        yield_leadership: !!connection.yield_leadership,
        meta: connMeta
      }
    ],
    meta: memberMeta
  };

  party.members.push(member);
  memberToParty.set(accountId, partyId);

  const rsaUpdate = updateRawSquadAssignmentsOnJoin(party, accountId);
  if (Object.keys(rsaUpdate).length > 0) party.revision++;
  party.updated_at = now;

  const captain = party.members.find(m => m.role === "CAPTAIN");

  for (const m of party.members) {
    sendXmppMessage(m.account_id, {
      account_dn: connMeta["urn:epic:member:dn_s"] || memberMeta["urn:epic:member:dn_s"] || "Player",
      account_id: accountId,
      connection: {
        connected_at: now,
        id: connId,
        meta: connMeta,
        updated_at: now
      },
      joined_at: now,
      member_state_updated: memberMeta,
      ns: "Fortnite",
      party_id: partyId,
      revision: 0,
      sent: now,
      type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
      updated_at: now
    });

    sendXmppMessage(m.account_id, {
      captain_id: captain?.account_id || "",
      created_at: party.created_at,
      invite_ttl_seconds: (party.config as Record<string, unknown>).invite_ttl || 14400,
      max_number_of_members: (party.config as Record<string, unknown>).max_size || 16,
      ns: "Fortnite",
      party_id: partyId,
      party_privacy_type: (party.config as Record<string, unknown>).joinability,
      party_state_overriden: {},
      party_state_removed: [],
      party_state_updated: rsaUpdate,
      party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
      party_type: "DEFAULT",
      revision: party.revision,
      sent: now,
      type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
      updated_at: now
    });
  }

  return c.json({ status: "JOINED", party_id: partyId });
}

export async function leaveParty(c: Context) {
  const partyId = c.req.param("partyId");
  const accountId = c.req.param("accountId");
  const party = parties.get(partyId);

  if (!party) return c.body(null, 204);

  const member = party.members.find(m => m.account_id === accountId);
  if (!member) return c.body(null, 204);

  const wasCaptain = member.role === "CAPTAIN";
  const leftAt = new Date().toISOString();

  for (const m of party.members) {
    sendXmppMessage(m.account_id, {
      account_id: accountId,
      member_state_update: {},
      ns: "Fortnite",
      party_id: partyId,
      revision: party.revision || 0,
      sent: leftAt,
      type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT"
    });
  }

  party.members = party.members.filter(m => m.account_id !== accountId);
  memberToParty.delete(accountId);

  if (party.members.length === 0) {
    parties.delete(partyId);
    return c.body(null, 204);
  }

  if (wasCaptain) party.members[0].role = "CAPTAIN";

  const rsaUpdate = updateRawSquadAssignmentsOnLeave(party, accountId);
  party.updated_at = leftAt;
  if (Object.keys(rsaUpdate).length > 0) {
    broadcastPartyUpdated(party, rsaUpdate, []);
  }

  return c.body(null, 204);
}

export function handleMemberDisconnect(accountId: string): void {
  const partyId = memberToParty.get(accountId);
  if (!partyId) return;
  const party = parties.get(partyId);
  if (!party) {
    memberToParty.delete(accountId);
    return;
  }

  const member = party.members.find(m => m.account_id === accountId);
  if (!member) {
    memberToParty.delete(accountId);
    return;
  }

  const wasCaptain = member.role === "CAPTAIN";
  const now = new Date().toISOString();

  for (const m of party.members) {
    sendXmppMessage(m.account_id, {
      account_id: accountId,
      member_state_update: {},
      ns: "Fortnite",
      party_id: partyId,
      revision: party.revision || 0,
      sent: now,
      type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT"
    });
  }

  party.members = party.members.filter(m => m.account_id !== accountId);
  memberToParty.delete(accountId);

  if (party.members.length === 0) {
    parties.delete(partyId);
    return;
  }

  if (wasCaptain) {
    party.members[0].role = "CAPTAIN";
    const newCaptain = party.members[0];
    for (const m of party.members) {
      sendXmppMessage(m.account_id, {
        account_id: newCaptain.account_id,
        member_state_update: {},
        ns: "Fortnite",
        party_id: partyId,
        revision: party.revision || 0,
        sent: now,
        type: "com.epicgames.social.party.notification.v0.MEMBER_NEW_CAPTAIN"
      });
    }
  }

  const rsaUpdate = updateRawSquadAssignmentsOnLeave(party, accountId);
  party.updated_at = now;
  if (Object.keys(rsaUpdate).length > 0) {
    broadcastPartyUpdated(party, rsaUpdate, []);
  }
}

export async function kickMember(c: Context) {
  const partyId = c.req.param("partyId");
  const accountId = c.req.param("accountId");
  const requesterId = c.get("accountId");
  const party = parties.get(partyId);

  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  const requester = party.members.find(m => m.account_id === requesterId);
  if (!requester || requester.role !== "CAPTAIN") {
    return sendError(c, "errors.com.epicgames.social.party.unauthorized", `User ${requesterId} is not allowed to kick`, [requesterId], 51015, null, 403);
  }

  const member = party.members.find(m => m.account_id === accountId);
  if (!member) return c.body(null, 204);

  party.members = party.members.filter(m => m.account_id !== accountId);
  memberToParty.delete(accountId);
  party.revision++;
  party.updated_at = new Date().toISOString();

  sendXmppMessage(accountId, {
    type: "com.epicgames.social.party.notification.v0.MEMBER_KICKED",
    party_id: partyId,
    account_id: accountId,
    revision: party.revision,
    ns: "Fortnite",
    sent: new Date().toISOString()
  });

  for (const m of party.members) {
    sendXmppMessage(m.account_id, {
      type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT",
      party_id: partyId,
      account_id: accountId,
      revision: party.revision,
      ns: "Fortnite",
      sent: new Date().toISOString()
    });
  }

  return c.body(null, 204);
}

export async function updateMember(c: Context) {
  const partyId = c.req.param("partyId");
  const accountId = c.req.param("accountId");
  const requesterId = c.get("accountId");
  const party = parties.get(partyId);

  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  if (requesterId !== accountId) {
    return sendError(c, "errors.com.epicgames.social.party.unauthorized", `User ${requesterId} is not allowed to edit member ${accountId}`, [requesterId, accountId], 51015, null, 403);
  }

  const member = party.members.find(m => m.account_id === accountId);
  if (!member) {
    return sendError(c, "errors.com.epicgames.social.party.member_not_found", "Member not found", [], 51004, null, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const updated = (body.update && typeof body.update === "object") ? body.update : {};
  const deleted = Array.isArray(body.delete) ? body.delete : [];

  for (const key of deleted) delete member.meta[key];
  for (const key of Object.keys(updated)) member.meta[key] = updated[key];

  member.revision = typeof body.revision === "number" ? body.revision : member.revision + 1;
  member.updated_at = new Date().toISOString();
  party.updated_at = member.updated_at;

  for (const m of party.members) {
    sendXmppMessage(m.account_id, {
      account_id: accountId,
      account_dn: member.meta["urn:epic:member:dn_s"] || "Player",
      member_state_updated: updated,
      member_state_removed: deleted,
      member_state_overridden: {},
      party_id: partyId,
      updated_at: member.updated_at,
      sent: new Date().toISOString(),
      revision: member.revision,
      ns: "Fortnite",
      type: "com.epicgames.social.party.notification.v0.MEMBER_STATE_UPDATED"
    });
  }

  return c.body(null, 204);
}

export async function promoteMember(c: Context) {
  const partyId = c.req.param("partyId");
  const accountId = c.req.param("accountId");
  const requesterId = c.get("accountId");
  const party = parties.get(partyId);

  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  const currentCaptain = party.members.find(m => m.role === "CAPTAIN");
  if (!currentCaptain || currentCaptain.account_id !== requesterId) {
    return sendError(c, "errors.com.epicgames.social.party.unauthorized", `User ${requesterId} cannot promote`, [requesterId], 51015, null, 403);
  }

  const member = party.members.find(m => m.account_id === accountId);
  if (!member) {
    return sendError(c, "errors.com.epicgames.social.party.member_not_found", "Member not found", [], 51004, null, 404);
  }

  currentCaptain.role = "MEMBER";
  member.role = "CAPTAIN";
  party.revision++;
  party.updated_at = new Date().toISOString();

  for (const m of party.members) {
    sendXmppMessage(m.account_id, {
      account_id: accountId,
      member_state_update: {},
      ns: "Fortnite",
      party_id: partyId,
      revision: party.revision || 0,
      sent: new Date().toISOString(),
      type: "com.epicgames.social.party.notification.v0.MEMBER_NEW_CAPTAIN"
    });
  }

  return c.body(null, 204);
}

export async function sendInvite(c: Context) {
  const partyId = c.req.param("partyId");
  const inviteeId = c.req.param("accountId");
  const senderId = c.get("accountId");
  const party = parties.get(partyId);

  logger.info(`[party] sendInvite: partyId=${partyId} inviter=${senderId} invitee=${inviteeId}`);

  if (!party) {
    logger.warn(`[party] sendInvite: party ${partyId} not found`);
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const sendPing = c.req.query("sendPing") === "true";

  const inviter = party.members.find(m => m.account_id === senderId);
  if (!inviter) return c.body(null, 403);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600000).toISOString();

  const existingIdx = (party.invites as PartyInvite[]).findIndex(i => i.sent_to === inviteeId && i.sent_by === senderId);
  if (existingIdx !== -1) party.invites.splice(existingIdx, 1);

  const invite: PartyInvite = {
    party_id: partyId,
    sent_by: senderId,
    sent_to: inviteeId,
    sent_at: now,
    updated_at: now,
    expires_at: expiresAt,
    status: "SENT",
    meta: body || {}
  };
  party.invites.push(invite);
  party.updated_at = now;

  const friendsDoc = await findFriendsByAccountId(senderId);
  const friendsIds = party.members
    .filter(m => friendsDoc?.accepted.some((f: FriendEntry) => f.accountId === m.account_id))
    .map(m => m.account_id);

  sendXmppMessage(inviteeId, {
    expires: expiresAt,
    meta: body || {},
    ns: "Fortnite",
    party_id: partyId,
    inviter_dn: inviter.meta["urn:epic:member:dn_s"] || "Player",
    inviter_id: senderId,
    invitee_id: inviteeId,
    members_count: party.members.length,
    sent_at: now,
    updated_at: now,
    friends_ids: friendsIds,
    sent: now,
    type: "com.epicgames.social.party.notification.v0.INITIAL_INVITE"
  });

  if (sendPing) {
    const existingPing = pings.findIndex(p => p.sent_to === inviteeId && p.sent_by === senderId);
    if (existingPing !== -1) pings.splice(existingPing, 1);

    pings.push({
      sent_by: senderId,
      sent_to: inviteeId,
      sent_at: now,
      expires_at: expiresAt,
      meta: body || {}
    });

    const version = getVersionInfo(c.req.header("user-agent") || "");

    sendXmppMessage(inviteeId, {
      expires: expiresAt,
      meta: body || {},
      ns: "Fortnite",
      pinger_dn: inviter.meta["urn:epic:member:dn_s"] || "Player",
      pinger_id: senderId,
      sent: now,
      version: String(version.build).padEnd(5, "0"),
      type: "com.epicgames.social.party.notification.v0.PING"
    });
  }

  return c.body(null, 204);
}

export async function declineInvite(c: Context) {
  const partyId = c.req.param("partyId");
  const inviteeId = c.req.param("accountId");
  const party = parties.get(partyId);

  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", `Party ${partyId} does not exist`, [partyId], 51002, null, 404);
  }

  const invite = (party.invites as PartyInvite[]).find(i => i.sent_to === inviteeId);
  if (!invite) return c.body(null, 204);

  const inviter = party.members.find(m => m.account_id === invite.sent_by);
  party.invites = (party.invites as PartyInvite[]).filter(i => i.sent_to !== inviteeId);

  if (inviter) {
    sendXmppMessage(invite.sent_by, {
      expires: invite.expires_at,
      meta: invite.meta,
      ns: "Fortnite",
      party_id: partyId,
      inviter_dn: inviter.meta["urn:epic:member:dn_s"] || "Player",
      inviter_id: invite.sent_by,
      invitee_id: inviteeId,
      sent_at: invite.sent_at,
      updated_at: invite.updated_at,
      sent: new Date().toISOString(),
      type: "com.epicgames.social.party.notification.v0.INVITE_CANCELLED"
    });
  }

  return c.body(null, 204);
}

export async function getPings(c: Context) {
  const accountId = c.req.param("accountId");
  return c.json(pings.filter(p => p.sent_to === accountId));
}

export async function sendPing(c: Context) {
  const accountId = c.req.param("accountId");
  const pingerId = c.req.param("pingerId");
  const body = await c.req.json().catch(() => ({}));
  const version = getVersionInfo(c.req.header("user-agent") || "");

  const existing = pings.findIndex(p => p.sent_to === accountId && p.sent_by === pingerId);
  if (existing !== -1) pings.splice(existing, 1);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600000).toISOString();

  const ping: Ping = {
    sent_by: pingerId,
    sent_to: accountId,
    sent_at: now,
    expires_at: expiresAt,
    meta: body?.meta || {}
  };
  pings.push(ping);

  const pingerUser = await findUserByAccountId(pingerId);
  sendXmppMessage(accountId, {
    expires: expiresAt,
    meta: body?.meta || {},
    ns: "Fortnite",
    pinger_dn: pingerUser?.username || "Player",
    pinger_id: pingerId,
    sent: now,
    version: String(version.build).padEnd(5, "0"),
    type: "com.epicgames.social.party.notification.v0.PING"
  });

  return c.json(ping);
}

export async function deletePing(c: Context) {
  const accountId = c.req.param("accountId");
  const pingerId = c.req.param("pingerId");
  const idx = pings.findIndex(p => p.sent_to === accountId && p.sent_by === pingerId);
  if (idx !== -1) pings.splice(idx, 1);
  return c.body(null, 204);
}

export async function getPartiesForPing(c: Context) {
  const accountId = c.req.param("accountId");
  const pingerId = c.req.param("pingerId");

  let query = pings.filter(p => p.sent_to === accountId && p.sent_by === pingerId);
  if (query.length === 0) {
    query = [{ sent_by: pingerId, sent_to: accountId, sent_at: "", expires_at: "", meta: {} }];
  }

  const result: Party[] = [];
  for (const p of query) {
    const partyId = memberToParty.get(p.sent_by);
    if (!partyId) continue;
    const party = parties.get(partyId);
    if (party) result.push(party);
  }

  return c.json(result);
}

export async function joinPingParty(c: Context) {
  const accountId = c.req.param("accountId");
  const pingerId = c.req.param("pingerId");

  const partyId = memberToParty.get(pingerId);
  if (!partyId) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", "Party not found", [], 51002, null, 404);
  }
  const party = parties.get(partyId);
  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", "Party not found", [], 51002, null, 404);
  }

  if (party.members.find(m => m.account_id === accountId)) {
    return c.json({ status: "JOINED", party_id: partyId });
  }

  const oldPartyId = memberToParty.get(accountId);
  if (oldPartyId && oldPartyId !== partyId) {
    const oldParty = parties.get(oldPartyId);
    if (oldParty) {
      const wasCaptain = oldParty.members.find(m => m.account_id === accountId)?.role === "CAPTAIN";
      const leftAt = new Date().toISOString();

      for (const om of oldParty.members) {
        sendXmppMessage(om.account_id, {
          account_id: accountId,
          member_state_update: {},
          ns: "Fortnite",
          party_id: oldPartyId,
          revision: oldParty.revision || 0,
          sent: leftAt,
          type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT"
        });
      }

      oldParty.members = oldParty.members.filter(m => m.account_id !== accountId);

      if (oldParty.members.length === 0) {
        parties.delete(oldPartyId);
      } else if (wasCaptain) {
        oldParty.members[0].role = "CAPTAIN";
        const newCap = oldParty.members[0];
        for (const om of oldParty.members) {
          sendXmppMessage(om.account_id, {
            account_id: newCap.account_id,
            member_state_update: {},
            ns: "Fortnite",
            party_id: oldPartyId,
            revision: oldParty.revision || 0,
            sent: leftAt,
            type: "com.epicgames.social.party.notification.v0.MEMBER_NEW_CAPTAIN"
          });
        }
      }
    }
  }

  const user = await findUserByAccountId(accountId);
  const displayName = user?.username || "Player";
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  logger.info(`[party] joinPing: accountId=${accountId} joining partyId=${partyId} via pingerId=${pingerId}`);

  const member = buildMember(accountId, displayName, body.connection?.yield_leadership ? "CAPTAIN" : "MEMBER", body);
  party.members.push(member);
  memberToParty.set(accountId, partyId);

  const rsaUpdate = updateRawSquadAssignmentsOnJoin(party, accountId);
  party.revision++;
  party.updated_at = now;

  const captain = party.members.find(m => m.role === "CAPTAIN");

  for (const m of party.members) {
    sendXmppMessage(m.account_id, {
      account_dn: displayName,
      account_id: accountId,
      connection: member.connections[0],
      joined_at: now,
      member_state_updated: member.meta,
      ns: "Fortnite",
      party_id: partyId,
      revision: 0,
      sent: now,
      type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
      updated_at: now
    });

    sendXmppMessage(m.account_id, {
      captain_id: captain?.account_id || "",
      created_at: party.created_at,
      invite_ttl_seconds: (party.config as Record<string, unknown>).invite_ttl || 14400,
      max_number_of_members: (party.config as Record<string, unknown>).max_size || 16,
      ns: "Fortnite",
      party_id: partyId,
      party_privacy_type: (party.config as Record<string, unknown>).joinability,
      party_state_overriden: {},
      party_state_removed: [],
      party_state_updated: rsaUpdate,
      party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
      party_type: "DEFAULT",
      revision: party.revision,
      sent: now,
      type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
      updated_at: now
    });
  }

  return c.json({ status: "JOINED", party_id: partyId });
}

export async function createIntention(c: Context) {
  const accountId = c.req.param("accountId");
  const senderId = c.req.param("senderId");

  logger.info(`[party] intention: accountId=${accountId} senderId=${senderId}`);

  const partyId = memberToParty.get(senderId);
  if (!partyId) {
    logger.warn(`[party] intention: no party for senderId=${senderId}`);
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", "Party not found", [], 51002, null, 404);
  }
  const party = parties.get(partyId);
  if (!party) {
    return sendError(c, "errors.com.epicgames.social.party.party_not_found", "Party not found", [], 51002, null, 404);
  }

  const sender = party.members.find(m => m.account_id === senderId);
  const captain = party.members.find(m => m.role === "CAPTAIN");
  if (!sender || !captain) {
    return sendError(c, "errors.com.epicgames.social.party.member_not_found", "Member not found", [], 51004, null, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600000).toISOString();

  const intention: PartyIntention = {
    requester_id: senderId,
    requester_dn: (sender.meta["urn:epic:member:dn_s"] as string) || "Player",
    requester_pl: captain.account_id,
    requester_pl_dn: (captain.meta["urn:epic:member:dn_s"] as string) || "Player",
    requestee_id: accountId,
    meta: body || {},
    expires_at: expiresAt,
    sent_at: now
  };

  party.intentions.push(intention);

  const friendsDoc = await findFriendsByAccountId(accountId);
  const friendsIds = party.members
    .filter(m => friendsDoc?.accepted.some((f: FriendEntry) => f.accountId === m.account_id))
    .map(m => m.account_id);

  sendXmppMessage(accountId, {
    expires_at: expiresAt,
    requester_id: senderId,
    requester_dn: intention.requester_dn,
    requester_pl: captain.account_id,
    requester_pl_dn: intention.requester_pl_dn,
    requestee_id: accountId,
    meta: body || {},
    sent_at: now,
    updated_at: now,
    friends_ids: friendsIds,
    members_count: party.members.length,
    party_id: partyId,
    ns: "Fortnite",
    sent: now,
    type: "com.epicgames.social.party.notification.v0.INITIAL_INTENTION"
  });

  logger.info(`[party] intention sent to ${accountId} with party_id=${partyId} (captain=${captain.account_id})`);

  return c.json(intention);
}

export async function getPartyLookup(c: Context) {
  const body = await c.req.json().catch(() => ({}));
  const partyIds: string[] = Array.isArray(body.partyIds) ? body.partyIds : [];

  const result: Party[] = [];
  for (const id of partyIds) {
    const party = parties.get(id);
    if (party) result.push(party);
  }

  return c.json(result);
}

export async function memberMeta(c: Context) {
  const partyId = c.req.param("partyId");
  const accountId = c.req.param("accountId");
  const party = parties.get(partyId);
  if (!party) return c.json({});

  const member = party.members.find(m => m.account_id === accountId);
  return c.json(member?.meta || {});
}
