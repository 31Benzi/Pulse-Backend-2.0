import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const bannedIps = pgTable("banned_ips", {
  id: uuid("id").primaryKey().defaultRandom(),
  ip: text("ip").notNull().unique(),
  reason: text("reason"),
  bannedBy: text("banned_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BannedIp = typeof bannedIps.$inferSelect;
export type NewBannedIp = typeof bannedIps.$inferInsert;
