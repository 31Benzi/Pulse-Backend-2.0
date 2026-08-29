import { pgTable, text, timestamp, boolean, integer, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull().unique(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  matchmakingId: text("matchmaking_id").notNull(),
  isServer: boolean("is_server").default(false).notNull(),
  banned: boolean("banned").default(false).notNull(),
  arenaDivision: integer("arena_division").default(1).notNull(),
  arenaHype: integer("arena_hype").default(0).notNull(),
  lastIp: text("last_ip"),
  lastNameChange: timestamp("last_name_change"),
  discordId: text("discord_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
