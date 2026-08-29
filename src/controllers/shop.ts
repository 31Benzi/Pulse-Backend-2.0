import type { Context } from "hono";
import { rotateShop } from "../services/shopRotator";
import { getItemShopData } from "../db/queries";

export async function rotateShopHandler(c: Context) {
  try {
    const success = await rotateShop();

    if (success) {
      return c.json({ success: true, message: "Shop rotated successfully" });
    } else {
      return c.json({ success: false, message: "Failed to rotate shop" }, 500);
    }
  } catch (error) {
    return c.json({ success: false, message: `Error: ${error}` }, 500);
  }
}

export async function getShopData(c: Context) {
  try {
    const shopData = await getItemShopData();

    if (!shopData) {
      return c.json({ success: false, message: "No shop data found" }, 404);
    }

    return c.json({
      success: true,
      updatedAt: shopData.updatedAt,
      itemCount: shopData.items.length,
      items: shopData.items.map(({ id, name, rarity, vbucks, icon, description }) => ({
        id,
        name,
        rarity,
        vbucks,
        icon,
        description,
      })),
    });
  } catch (error) {
    return c.json({ success: false, message: `Error: ${error}` }, 500);
  }
}
