import { pgTable, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";

export interface ItemEntry {
  id: number;
  name: string;
  rarity: string;
  vbucks: number;
  icon: string;
  description: string;
  section: string;
  itemGrants: string[];
  price: number;
}

export const itemShop = pgTable("item_shop", {
  id: uuid("id").primaryKey().defaultRandom(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  items: jsonb("items").notNull().$type<ItemEntry[]>().default([]),
});

export type ItemShop = typeof itemShop.$inferSelect;
