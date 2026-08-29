import { pgTable, text, uuid, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull().unique().references(() => users.accountId),
  profiles: jsonb("profiles").notNull().$type<Record<string, unknown>>(),
});

export type Profile = typeof profiles.$inferSelect;
