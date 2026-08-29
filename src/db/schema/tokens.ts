import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const tokens = pgTable("tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull().unique().references(() => users.accountId),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Token = typeof tokens.$inferSelect;
