import { getClientByAccountId, xmppDomain, type XmppClient } from "./state";
import { findFriendsByAccountId } from "../db/queries";

function escapeXmlText(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sendPresenceToClient(to: XmppClient, status: string, away: boolean, from: XmppClient, offline = false): void {
  const parts: string[] = [];
  parts.push(`<presence to="${to.jid}" xmlns="jabber:client" from="${from.jid}" type="${offline ? "unavailable" : "available"}">`);
  if (away) parts.push(`<show>away</show>`);
  parts.push(`<status>${escapeXmlText(status)}</status>`);
  parts.push(`</presence>`);
  to.ws.send(parts.join(""));
}

export async function getPresenceFromFriends(client: XmppClient): Promise<void> {
  const friends = await findFriendsByAccountId(client.accountId);
  if (!friends) return;

  for (const friend of friends.accepted) {
    const other = getClientByAccountId(friend.accountId);
    if (!other) continue;

    sendPresenceToClient(
      client,
      other.lastPresenceUpdate.status,
      other.lastPresenceUpdate.away,
      other,
      false
    );
  }
}

export async function updatePresenceForFriends(sender: XmppClient, status: string, away: boolean, offline: boolean): Promise<void> {
  sender.lastPresenceUpdate.away = away;
  sender.lastPresenceUpdate.status = status;

  const friends = await findFriendsByAccountId(sender.accountId);
  if (!friends) return;

  for (const friend of friends.accepted) {
    const other = getClientByAccountId(friend.accountId);
    if (!other) continue;

    sendPresenceToClient(other, status, away, sender, offline);

    if (!offline) {
      sendPresenceToClient(sender, other.lastPresenceUpdate.status, other.lastPresenceUpdate.away, other, false);
    }
  }
}

export function sendPresenceFromUser(fromAccountId: string, toAccountId: string, offline: boolean): void {
  const from = getClientByAccountId(fromAccountId);
  const to = getClientByAccountId(toAccountId);
  if (!from || !to) return;

  sendPresenceToClient(
    to,
    from.lastPresenceUpdate.status,
    from.lastPresenceUpdate.away,
    from,
    offline
  );
}

export function broadcastFriendEvent(
  accountId: string,
  friendId: string,
  eventStatus: "ACCEPTED" | "PENDING" | "ABORTED" | "DELETED",
  direction: "INBOUND" | "OUTBOUND"
): void {
  const client = getClientByAccountId(accountId);
  if (!client) return;

  const payload = {
    payload: {
      accountId: friendId,
      status: eventStatus,
      direction,
      created: new Date().toISOString(),
      favorite: false
    },
    type:
      eventStatus === "DELETED" || eventStatus === "ABORTED"
        ? "com.epicgames.friends.core.apiobjects.FriendRemoval"
        : "com.epicgames.friends.core.apiobjects.Friend",
    timestamp: new Date().toISOString()
  };

  client.ws.send(
    `<message from="xmpp-admin@${xmppDomain}" to="${client.jid}" xmlns="jabber:client"><body>${escapeXmlText(
      JSON.stringify(payload)
    )}</body></message>`
  );
}
