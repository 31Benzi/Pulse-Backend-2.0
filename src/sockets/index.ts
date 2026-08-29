export { xmppWebSocketHandler, createXmppClientData, sendXmppToAccountId } from "./xmpp";
export { xmppClients, MUCs, xmppDomain, getClientByAccountId, getClientByJid, getMUCmember } from "./state";
export type { XmppClient, XmppClientData, MUCRoom } from "./state";
export {
  broadcastFriendEvent,
  sendPresenceFromUser,
  updatePresenceForFriends,
  getPresenceFromFriends
} from "./presence";
