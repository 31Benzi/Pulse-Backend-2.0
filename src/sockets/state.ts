import type { ServerWebSocket } from "bun";

export interface XmppClientData {
  initialized: boolean;
  id: string;
  accountId: string;
  displayName: string;
  token: string;
  jid: string;
  resource: string;
  authenticated: boolean;
  clientExists: boolean;
  connectionClosed: boolean;
  joinedMUCs: string[];
  lastPresenceUpdate: { away: boolean; status: string };
}

export interface XmppClient {
  ws: ServerWebSocket<XmppClientData>;
  accountId: string;
  displayName: string;
  token: string;
  jid: string;
  resource: string;
  lastPresenceUpdate: { away: boolean; status: string };
}

export interface MUCRoom {
  members: { accountId: string }[];
}

export const xmppDomain = "prod.ol.epicgames.com";
export const xmppClients: XmppClient[] = [];
export const MUCs: Record<string, MUCRoom> = {};

export function getClientByAccountId(accountId: string): XmppClient | undefined {
  return xmppClients.find(c => c.accountId === accountId);
}

export function getClientByJid(jid: string): XmppClient | undefined {
  const bare = jid.split("/")[0];
  return xmppClients.find(c => c.jid.split("/")[0] === bare || c.jid === jid);
}

export function removeClientByWs(ws: ServerWebSocket<XmppClientData>): XmppClient | undefined {
  const idx = xmppClients.findIndex(c => c.ws === ws);
  if (idx === -1) return undefined;
  const [removed] = xmppClients.splice(idx, 1);
  return removed;
}

export function getMUCmember(roomName: string, displayName: string, accountId: string, resource: string): string {
  return `${roomName}@muc.${xmppDomain}/${encodeURI(displayName)}:${accountId}:${resource}`;
}
