import { getDb, itemShop } from "../db";
import type { ItemEntry } from "../db/schema";
import { logger } from "../utils/helpers";

interface FortniteAPICosmetic {
  id: string;
  name: string;
  description: string;
  type: {
    value: string;
    displayValue: string;
  };
  rarity: {
    value: string;
    displayValue: string;
  };
  images: {
    icon: string | null;
    featured: string | null;
    smallIcon: string | null;
  };
  introduction: {
    chapter: string;
    season: string;
  } | null;
  shopHistory: string[] | null;
}

interface FortniteAPIResponse {
  status: number;
  data: FortniteAPICosmetic[];
}

const RARITY_PRICES: Record<string, number> = {
  legendary: 2000,
  epic: 1500,
  rare: 1200,
  uncommon: 800,
  common: 500,
};

const TYPE_MULTIPLIERS: Record<string, number> = {
  outfit: 1.0,
  backpack: 0.6,
  pickaxe: 0.8,
  glider: 0.8,
  emote: 0.5,
  wrap: 0.5,
  loadingscreen: 0.3,
  music: 0.3,
  contrail: 0.4,
  spray: 0.2,
  emoji: 0.2,
};

function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function calculatePrice(cosmetic: FortniteAPICosmetic): number {
  const rarityBase = RARITY_PRICES[cosmetic.rarity.value.toLowerCase()] || 800;
  const typeMultiplier = TYPE_MULTIPLIERS[cosmetic.type.value.toLowerCase()] || 1.0;
  return Math.round(rarityBase * typeMultiplier);
}


export async function rotateShop(): Promise<boolean> {
  try {
    logger.info("ShopRotator Starting shop rotation...");

    const response = await fetch("https://fortnite-api.com/v2/cosmetics/br");
    if (!response.ok) {
      logger.error(`ShopRotator Failed to fetch cosmetics: ${response.status}`);
      return false;
    }

    const data = (await response.json()) as FortniteAPIResponse;
    if (!data.data || data.data.length === 0) {
      logger.error("ShopRotator No cosmetics data received");
      return false;
    }

    logger.info(`ShopRotator Fetched ${data.data.length} cosmetics`);

    const s9Cosmetics = data.data.filter((item) => {
      if (!item.introduction) return false;
      if (item.introduction.chapter !== "1") return false;
      return parseInt(item.introduction.season, 10) <= 9;
    });

    const outfits = s9Cosmetics.filter(
      (item) => item.type?.value?.toLowerCase() === "outfit"
    );
    const accessories = s9Cosmetics.filter((item) =>
      ["backpack", "pickaxe", "glider", "emote", "wrap"].includes(
        item.type?.value?.toLowerCase() || ""
      )
    );

    logger.info(`ShopRotator Found ${outfits.length} outfits, ${accessories.length} accessories`);

    const featuredItems = getRandomItems(outfits, 6);
    const dailyItems = getRandomItems(accessories, 6);

    const items: ItemEntry[] = [];
    let index = 1;

    for (const cosmetic of featuredItems) {
      const price = calculatePrice(cosmetic);
      items.push({
        id: index++,
        name: cosmetic.name,
        rarity: cosmetic.rarity.displayValue,
        vbucks: price,
        icon: cosmetic.images.featured ?? cosmetic.images.icon ?? cosmetic.images.smallIcon ?? "",
        description: cosmetic.description ?? "",
        section: "Featured",
        itemGrants: [`AthenaCharacter:${cosmetic.id}`],
        price,
      });
    }

    for (const cosmetic of dailyItems) {
      const price = calculatePrice(cosmetic);
      const typePrefix: Record<string, string> = {
        backpack: "AthenaBackpack",
        pickaxe: "AthenaPickaxe",
        glider: "AthenaGlider",
        emote: "AthenaDance",
        wrap: "AthenaItemWrap",
      };
      const prefix = typePrefix[cosmetic.type.value.toLowerCase()] ?? "AthenaCharacter";
      items.push({
        id: index++,
        name: cosmetic.name,
        rarity: cosmetic.rarity.displayValue,
        vbucks: price,
        icon: cosmetic.images.icon ?? cosmetic.images.smallIcon ?? "",
        description: cosmetic.description ?? "",
        section: "Daily",
        itemGrants: [`${prefix}:${cosmetic.id}`],
        price,
      });
    }

    const db = getDb();
    
    await db.delete(itemShop);
    
    await db.insert(itemShop).values({
      items,
      updatedAt: new Date(),
    });

    logger.info(
      `ShopRotator Shop rotated successfully! Featured: ${featuredItems.length}, Daily: ${dailyItems.length}`
    );
    return true;
  } catch (error) {
    logger.error(`ShopRotator Error rotating shop: ${error}`);
    return false;
  }
}

export function parseRotationTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  
  return { hours, minutes };
}

export function getNextRotationTime(hours: number, minutes: number): Date {
  const now = new Date();
  const next = new Date();
  
  next.setUTCHours(hours, minutes, 0, 0);
  
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  
  return next;
}

export function startShopRotator(): void {
  const rotationTime = process.env.rotationTime || "00:00";
  let parsed = parseRotationTime(rotationTime);
  
  if (!parsed) {
    logger.warn(`ShopRotator Invalid rotationTime format: ${rotationTime}. Expected HH:MM. Defaulting to 00:00 UTC`);
    parsed = { hours: 0, minutes: 0 };
  }
  
  const scheduleNextRotation = () => {
    const nextTime = getNextRotationTime(parsed.hours, parsed.minutes);
    const msUntilRotation = nextTime.getTime() - Date.now();
    
    logger.info(`ShopRotator Next rotation scheduled for ${nextTime.toISOString()} (in ${Math.round(msUntilRotation / 60000)} minutes)`);
    
    setTimeout(async () => {
      await rotateShop();
      scheduleNextRotation();
    }, msUntilRotation);
  };
  
  checkAndRotate().then(() => {
    scheduleNextRotation();
  });
}

async function checkAndRotate(): Promise<void> {
  try {
    const db = getDb();
    const result = await db.select().from(itemShop).limit(1);
    
    if (!result[0] || !result[0].items || result[0].items.length === 0) {
      logger.info("ShopRotator Shop is empty, performing initial rotation...");
      await rotateShop();
    } else {
      const lastUpdate = new Date(result[0].updatedAt);
      const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate >= 24) {
        logger.info(`ShopRotator Shop is ${Math.round(hoursSinceUpdate)} hours old, rotating...`);
        await rotateShop();
      } else {
        logger.info(`ShopRotator Shop was updated ${Math.round(hoursSinceUpdate)} hours ago, no rotation needed`);
      }
    }
  } catch (error) {
    logger.error(`ShopRotator Error checking shop status: ${error}`);
  }
}
