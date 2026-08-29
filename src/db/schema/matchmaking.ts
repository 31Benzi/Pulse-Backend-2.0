import { pgTable, text, integer, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const matchmaking = pgTable("matchmaking", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull().unique().references(() => users.accountId),
  sessionId: text("session_id").notNull(),
  playlist: text("playlist").notNull(),
  region: text("region").notNull(),
  buildUniqueId: text("build_unique_id").notNull(),
  ip: text("ip"),
  port: integer("port"),
});

export type Matchmaking = typeof matchmaking.$inferSelect;
