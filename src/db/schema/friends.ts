import { pgTable, text, uuid, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";

export interface FriendEntry {
  accountId: string;
  created: string;
  alias?: string;
}

export const friends = pgTable("friends", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull().unique().references(() => users.accountId),
  accepted: jsonb("accepted").notNull().$type<FriendEntry[]>().default([]),
  incoming: jsonb("incoming").notNull().$type<FriendEntry[]>().default([]),
  outgoing: jsonb("outgoing").notNull().$type<FriendEntry[]>().default([]),
  blocked: jsonb("blocked").notNull().$type<FriendEntry[]>().default([]),
});

export type Friends = typeof friends.$inferSelect;
