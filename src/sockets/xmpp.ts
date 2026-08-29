import type { ServerWebSocket, WebSocketHandler } from "bun";
import { parseXml, findChild, decodeBase64, type XmlNode } from "./xml";
import {
  xmppClients,
  MUCs,
  xmppDomain,
  getClientByAccountId,
  getClientByJid,
  removeClientByWs,
  getMUCmember,
  type XmppClient,
  type XmppClientData
} from "./state";
import { findUserByAccountId, findToken } from "../db/queries";
import { updatePresenceForFriends, getPresenceFromFriends, sendPresenceFromUser } from "./presence";
import { generateUuid, logger } from "../utils/helpers";
import { handleMemberDisconnect } from "../controllers/party";

function escapeXmlText(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function closeWithError(ws: ServerWebSocket<XmppClientData>): void {
  try {
    ws.send(`<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>`);
  } catch {}
  try {
    ws.close();
  } catch {}
}

function isJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function createXmppClientData(): XmppClientData {
  return {
    initialized: false,
    id: "",
    accountId: "",
    displayName: "",
    token: "",
    jid: "",
    resource: "",
    authenticated: false,
    clientExists: false,
    connectionClosed: false,
    joinedMUCs: [],
    lastPresenceUpdate: { away: false, status: "{}" }
  };
}

async function handleOpen(ws: ServerWebSocket<XmppClientData>): Promise<void> {
  const data = ws.data;
  if (!data.id) data.id = generateUuid();

  ws.send(
    `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="${xmppDomain}" id="${data.id}" version="1.0" xml:lang="en"/>`
  );

  if (data.authenticated) {
    ws.send(
      `<stream:features xmlns:stream="http://etherx.jabber.org/streams">` +
        `<ver xmlns="urn:xmpp:features:rosterver"/>` +
        `<starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>` +
        `<bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/>` +
        `<compression xmlns="http://jabber.org/features/compress"><method>zlib</method></compression>` +
        `<session xmlns="urn:ietf:params:xml:ns:xmpp-session"/>` +
        `</stream:features>`
    );
  } else {
    ws.send(
      `<stream:features xmlns:stream="http://etherx.jabber.org/streams">` +
        `<mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms>` +
        `<ver xmlns="urn:xmpp:features:rosterver"/>` +
        `<starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>` +
        `<compression xmlns="http://jabber.org/features/compress"><method>zlib</method></compression>` +
        `<auth xmlns="http://jabber.org/features/iq-auth"/>` +
        `</stream:features>`
    );
  }
}

async function handleAuth(ws: ServerWebSocket<XmppClientData>, msg: XmlNode): Promise<void> {
  const data = ws.data;
  if (!data.id) return;
  if (data.accountId) return;
  if (!msg.content) return closeWithError(ws);

  const decoded = decodeBase64(msg.content);
  if (!decoded.includes("\u0000")) return closeWithError(ws);

  const parts = decoded.split("\u0000");
  if (parts.length !== 3) return closeWithError(ws);

  const token = parts[2];
  const tokenRecord = await findToken(token);
  if (!tokenRecord) return closeWithError(ws);

  const existing = getClientByAccountId(tokenRecord.accountId);
  if (existing) {
    logger.info(`[XMPP] Kicking session for ${existing.displayName}`);
    try {
      await updatePresenceForFriends(existing, "{}", false, true);
    } catch {}
    removeClientByWs(existing.ws);
    try {
      existing.ws.send(`<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>`);
    } catch {}
    try {
      existing.ws.close();
    } catch {}
  }

  const user = await findUserByAccountId(tokenRecord.accountId);
  if (!user || user.banned) return closeWithError(ws);

  data.accountId = user.accountId;
  data.displayName = user.username;
  data.token = token;
  data.authenticated = true;

  logger.info(`[XMPP] Client ${user.username} authenticated.`);

  ws.send(`<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>`);
}

async function handleIq(ws: ServerWebSocket<XmppClientData>, msg: XmlNode): Promise<void> {
  const data = ws.data;
  if (!data.id) return;

  const iqId = msg.attributes.id;

  switch (iqId) {
    case "_xmpp_bind1": {
      if (data.resource || !data.accountId) return;
      const bind = findChild(msg, "bind");
      if (!bind) return;

      const resourceNode = findChild(bind, "resource");
      if (!resourceNode || !resourceNode.content) return;

      data.resource = resourceNode.content;
      data.jid = `${data.accountId}@${xmppDomain}/${data.resource}`;

      ws.send(
        `<iq to="${data.jid}" id="_xmpp_bind1" xmlns="jabber:client" type="result">` +
          `<bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>${data.jid}</jid></bind>` +
          `</iq>`
      );
      break;
    }

    case "_xmpp_session1": {
      if (!data.clientExists) return closeWithError(ws);

      ws.send(
        `<iq to="${data.jid}" from="${xmppDomain}" id="_xmpp_session1" xmlns="jabber:client" type="result"/>`
      );

      const client = xmppClients.find(c => c.ws === ws);
      if (client) {
        await getPresenceFromFriends(client);
        await updatePresenceForFriends(client, client.lastPresenceUpdate.status || "{}", client.lastPresenceUpdate.away, false);
      }
      break;
    }

    default: {
      if (!data.clientExists) return closeWithError(ws);

      ws.send(
        `<iq to="${data.jid}" from="${xmppDomain}" id="${iqId}" xmlns="jabber:client" type="result"/>`
      );
    }
  }
}

async function handleMessage(ws: ServerWebSocket<XmppClientData>, msg: XmlNode): Promise<void> {
  const data = ws.data;
  if (!data.clientExists) return closeWithError(ws);

  const bodyNode = findChild(msg, "body");
  if (!bodyNode || !bodyNode.content) return;

  const body = bodyNode.content;
  const type = msg.attributes.type;

  if (type === "chat") {
    if (!msg.attributes.to) return;
    if (body.length >= 300) return;

    const receiver = getClientByJid(msg.attributes.to);
    if (!receiver) return;
    if (receiver.accountId === data.accountId) return;

    receiver.ws.send(
      `<message to="${receiver.jid}" from="${data.jid}" xmlns="jabber:client" type="chat"><body>${escapeXmlText(body)}</body></message>`
    );
    return;
  }

  if (type === "groupchat") {
    if (!msg.attributes.to) return;
    if (body.length >= 300) return;

    const roomName = msg.attributes.to.split("@")[0];
    const MUC = MUCs[roomName];
    if (!MUC) return;
    if (!MUC.members.find(m => m.accountId === data.accountId)) return;

    for (const member of MUC.members) {
      const clientData = getClientByAccountId(member.accountId);
      if (!clientData) continue;

      clientData.ws.send(
        `<message to="${clientData.jid}" from="${getMUCmember(roomName, data.displayName, data.accountId, data.resource)}" xmlns="jabber:client" type="groupchat"><body>${escapeXmlText(body)}</body></message>`
      );
    }
    return;
  }

  if (isJSON(body)) {
    const bodyJSON = JSON.parse(body);
    if (Array.isArray(bodyJSON)) return;
    if (typeof bodyJSON.type !== "string") return;
    if (!msg.attributes.to) return;
    if (!msg.attributes.id) return;

    const receiver = getClientByJid(msg.attributes.to);
    if (!receiver) return;

    receiver.ws.send(
      `<message from="${data.jid}" id="${msg.attributes.id}" to="${receiver.jid}" xmlns="jabber:client"><body>${escapeXmlText(body)}</body></message>`
    );
  }
}

async function handlePresence(ws: ServerWebSocket<XmppClientData>, msg: XmlNode): Promise<void> {
  const data = ws.data;
  if (!data.clientExists) return closeWithError(ws);

  if (msg.attributes.type === "unavailable") {
    if (!msg.attributes.to) return;

    const to = msg.attributes.to;
    if (to.endsWith(`@muc.${xmppDomain}`) || to.split("/")[0].endsWith(`@muc.${xmppDomain}`)) {
      if (!to.toLowerCase().startsWith("party-")) return;

      const roomName = to.split("@")[0];
      if (!MUCs[roomName]) return;

      const memberIdx = MUCs[roomName].members.findIndex(m => m.accountId === data.accountId);
      if (memberIdx !== -1) {
        MUCs[roomName].members.splice(memberIdx, 1);
        const joinedIdx = data.joinedMUCs.indexOf(roomName);
        if (joinedIdx !== -1) data.joinedMUCs.splice(joinedIdx, 1);
      }

      ws.send(
        `<presence to="${data.jid}" from="${getMUCmember(roomName, data.displayName, data.accountId, data.resource)}" xmlns="jabber:client" type="unavailable">` +
          `<x xmlns="http://jabber.org/protocol/muc#user">` +
          `<item nick="${getMUCmember(roomName, data.displayName, data.accountId, data.resource).replace(`${roomName}@muc.${xmppDomain}/`, "")}" jid="${data.jid}" role="none"/>` +
          `<status code="110"/><status code="100"/><status code="170"/>` +
          `</x>` +
          `</presence>`
      );
      return;
    }
    return;
  }

  const mucJoin = findChild(msg, "x") || msg.children.find(c => c.name === "muc:x");
  if (mucJoin) {
    if (!msg.attributes.to) return;

    const roomName = msg.attributes.to.split("@")[0];
    if (!MUCs[roomName]) MUCs[roomName] = { members: [] };
    if (MUCs[roomName].members.find(m => m.accountId === data.accountId)) return;

    MUCs[roomName].members.push({ accountId: data.accountId });
    data.joinedMUCs.push(roomName);

    ws.send(
      `<presence to="${data.jid}" from="${getMUCmember(roomName, data.displayName, data.accountId, data.resource)}" xmlns="jabber:client">` +
        `<x xmlns="http://jabber.org/protocol/muc#user">` +
        `<item nick="${getMUCmember(roomName, data.displayName, data.accountId, data.resource).replace(`${roomName}@muc.${xmppDomain}/`, "")}" jid="${data.jid}" role="participant" affiliation="none"/>` +
        `<status code="110"/><status code="100"/><status code="170"/><status code="201"/>` +
        `</x>` +
        `</presence>`
    );

    for (const member of MUCs[roomName].members) {
      const other = getClientByAccountId(member.accountId);
      if (!other) continue;

      ws.send(
        `<presence from="${getMUCmember(roomName, other.displayName, other.accountId, other.resource)}" to="${data.jid}" xmlns="jabber:client">` +
          `<x xmlns="http://jabber.org/protocol/muc#user">` +
          `<item nick="${getMUCmember(roomName, other.displayName, other.accountId, other.resource).replace(`${roomName}@muc.${xmppDomain}/`, "")}" jid="${other.jid}" role="participant" affiliation="none"/>` +
          `</x>` +
          `</presence>`
      );

      if (other.accountId === data.accountId) continue;

      other.ws.send(
        `<presence from="${getMUCmember(roomName, data.displayName, data.accountId, data.resource)}" to="${other.jid}" xmlns="jabber:client">` +
          `<x xmlns="http://jabber.org/protocol/muc#user">` +
          `<item nick="${getMUCmember(roomName, data.displayName, data.accountId, data.resource).replace(`${roomName}@muc.${xmppDomain}/`, "")}" jid="${data.jid}" role="participant" affiliation="none"/>` +
          `</x>` +
          `</presence>`
      );
    }
    return;
  }

  const statusNode = findChild(msg, "status");
  if (!statusNode || !statusNode.content) return;
  if (!isJSON(statusNode.content)) return;
  const parsed = JSON.parse(statusNode.content);
  if (Array.isArray(parsed)) return;

  const client = xmppClients.find(c => c.ws === ws);
  if (!client) return;

  const away = !!findChild(msg, "show");
  await updatePresenceForFriends(client, statusNode.content, away, false);
  sendPresenceFromUser(data.accountId, data.accountId, false);
}

function finalizeClient(ws: ServerWebSocket<XmppClientData>): void {
  const data = ws.data;
  if (data.clientExists || data.connectionClosed) return;
  if (!(data.accountId && data.displayName && data.token && data.jid && data.id && data.resource && data.authenticated)) return;

  xmppClients.push({
    ws,
    accountId: data.accountId,
    displayName: data.displayName,
    token: data.token,
    jid: data.jid,
    resource: data.resource,
    lastPresenceUpdate: data.lastPresenceUpdate
  });

  data.clientExists = true;
}

function removeOnClose(ws: ServerWebSocket<XmppClientData>): void {
  const data = ws.data;
  data.connectionClosed = true;
  data.clientExists = false;

  const client = removeClientByWs(ws);
  if (!client) return;

  updatePresenceForFriends(client, "{}", false, true).catch(() => {});

  for (const roomName of data.joinedMUCs) {
    const MUC = MUCs[roomName];
    if (!MUC) continue;
    const idx = MUC.members.findIndex(m => m.accountId === client.accountId);
    if (idx !== -1) MUC.members.splice(idx, 1);
  }

  try {
    handleMemberDisconnect(client.accountId);
  } catch (err) {
    logger.error(`[XMPP] handleMemberDisconnect error: ${err}`);
  }

  logger.info(`[XMPP] Client ${client.displayName} disconnected.`);
}

export function sendXmppToAccountId(accountId: string, body: Record<string, unknown>): boolean {
  const client = getClientByAccountId(accountId);
  if (!client) return false;

  if (client.ws.readyState !== 1) {
    sweepDeadClient(client);
    return false;
  }

  try {
    client.ws.send(
      `<message from="xmpp-admin@${xmppDomain}" to="${client.jid}" xmlns="jabber:client"><body>${escapeXmlText(
        JSON.stringify(body)
      )}</body></message>`
    );
    return true;
  } catch {
    sweepDeadClient(client);
    return false;
  }
}

function sweepDeadClient(client: XmppClient): void {
  const removed = removeClientByWs(client.ws);
  if (!removed) return;
  logger.info(`[XMPP] Sweeping dead client ${client.displayName}`);
  updatePresenceForFriends(client, "{}", false, true).catch(() => {});
  try {
    handleMemberDisconnect(client.accountId);
  } catch {}
}

export function sweepAllDeadClients(): void {
  for (const client of [...xmppClients]) {
    if (client.ws.readyState !== 1) sweepDeadClient(client);
  }
}

setInterval(sweepAllDeadClients, 15000);

export const xmppWebSocketHandler: WebSocketHandler<XmppClientData> = {
  async open(ws) {
    ws.data.initialized = true;
  },

  async message(ws, message) {
    try {
      const raw = typeof message === "string" ? message : Buffer.from(message).toString("utf-8");
      const parsed = parseXml(raw);
      if (!parsed || !parsed.name) return closeWithError(ws);

      switch (parsed.name) {
        case "open":
          await handleOpen(ws);
          break;
        case "auth":
          await handleAuth(ws, parsed);
          break;
        case "iq":
          await handleIq(ws, parsed);
          break;
        case "message":
          await handleMessage(ws, parsed);
          break;
        case "presence":
          await handlePresence(ws, parsed);
          break;
      }

      finalizeClient(ws);
    } catch (err) {
      logger.error(`[XMPP] Error handling message: ${err}`);
    }
  },

  close(ws) {
    removeOnClose(ws);
  }
};
