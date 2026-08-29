import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const deviceAuths = pgTable("device_auths", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").notNull(),
  accountId: text("account_id").notNull().references(() => users.accountId),
  secret: text("secret").notNull(),
  userAgent: text("user_agent"),
  location: text("location"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DeviceAuth = typeof deviceAuths.$inferSelect;
