import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { CatalogEntry } from "../types";
import { getItemShopData } from "../db/queries";
import type { ItemEntry } from "../db/schema";

function ensureGiftInfo(catalog: Record<string, unknown>) {
  const storefronts = (catalog.storefronts as Record<string, unknown>[]) || [];
  for (const sf of storefronts) {
    const entries = (sf.catalogEntries as Record<string, unknown>[]) || [];
    for (const entry of entries) {
      if (!entry.giftInfo) {
        entry.giftInfo = {
          bIsEnabled: true,
          forcedGiftBoxTemplateId: "",
          purchaseRequirements: [],
          giftRecordIds: []
        };
      } else {
        const gi = entry.giftInfo as Record<string, unknown>;
        if (gi.bIsEnabled === undefined) gi.bIsEnabled = true;
      }
    }
  }
}

export async function getItemShop(): Promise<Record<string, unknown>> {
  const catalogPath = path.join(process.cwd(), "static", "shop", "catalog.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));

  const shopData = await getItemShopData();
  if (!shopData) {
    ensureGiftInfo(catalog);
    return catalog;
  }

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const saleExpiry = new Date(tomorrow.getTime() - 60000).toISOString();

  const storefronts = catalog.storefronts as unknown[];

  const dailyItems: ItemEntry[] = [];
  const featuredItems: ItemEntry[] = [];

  for (const item of shopData.items) {
    if (item.section.toLowerCase() === "daily") {
      dailyItems.push(item);
    } else if (item.section.toLowerCase() === "featured") {
      featuredItems.push(item);
    }
  }

  const createEntry = (item: ItemEntry, categories: string[], storeName: string, index: number): CatalogEntry => {
    const entry: CatalogEntry = {
      devName: "",
      offerId: "",
      fulfillmentIds: [],
      dailyLimit: -1,
      weeklyLimit: -1,
      monthlyLimit: -1,
      categories,
      prices: [{
        currencyType: "MtxCurrency",
        currencySubType: "",
        regularPrice: item.price ?? item.vbucks ?? 0,
        finalPrice: item.price ?? item.vbucks ?? 0,
        saleExpiration: saleExpiry,
        basePrice: item.price ?? item.vbucks ?? 0
      }],
      meta: {
        SectionId: "Featured",
        TileSize: "Normal"
      },
      matchFilter: "",
      filterWeight: 0,
      appStoreId: [],
      requirements: [],
      offerType: "StaticPrice",
      giftInfo: {
        bIsEnabled: true,
        forcedGiftBoxTemplateId: "",
        purchaseRequirements: [],
        giftRecordIds: []
      },
      refundable: true,
      metaInfo: [
        { key: "SectionId", value: "Featured" },
        { key: "TileSize", value: "Normal" }
      ],
      displayAssetPath: "",
      itemGrants: [],
      sortPriority: storeName === "BRDailyStorefront" ? -1 : 0,
      catalogGroupPriority: 0
    };

    for (const grant of item.itemGrants) {
      entry.requirements.push({
        requirementType: "DenyOnItemOwnership",
        requiredId: grant,
        minQuantity: 1
      });
      entry.itemGrants.push({
        templateId: grant,
        quantity: 1
      });
    }

    const keyHash = crypto.createHash("sha1").update(`${item.section}_${item.price}_${index}`).digest("hex");
    entry.devName = keyHash;
    entry.offerId = keyHash;

    return entry;
  };

  for (let i = 0; i < dailyItems.length; i++) {
    const entry = createEntry(dailyItems[i], [], "BRDailyStorefront", i);
    for (const sf of storefronts as Record<string, unknown>[]) {
      if (sf.name === "BRDailyStorefront") {
        (sf.catalogEntries as unknown[]).push(entry);
        break;
      }
    }
  }

  for (let i = 0; i < featuredItems.length; i++) {
    const cat = `FeaturedCategory${Math.floor(i / 2) + 1}`;
    const entry = createEntry(featuredItems[i], [cat], "BRWeeklyStorefront", i);
    for (const sf of storefronts as Record<string, unknown>[]) {
      if (sf.name === "BRWeeklyStorefront") {
        (sf.catalogEntries as unknown[]).push(entry);
        break;
      }
    }
  }

  ensureGiftInfo(catalog);
  return catalog;
}

export async function getOfferId(offerId: string): Promise<{ storeName: string; offer: CatalogEntry } | null> {
  const catalog = await getItemShop();
  const storefronts = catalog.storefronts as Record<string, unknown>[];

  for (const sf of storefronts) {
    const entries = sf.catalogEntries as Record<string, unknown>[];
    if (!entries) continue;

    for (const entry of entries) {
      if (entry.offerId === offerId) {
        return { storeName: sf.name as string, offer: entry as unknown as CatalogEntry };
      }
    }
  }

  return null;
}

export function findVariantEntry(variantsData: Record<string, unknown>[], templateId: string): Record<string, unknown> | null {
  for (const v of variantsData) {
    if ((v.id as string).toLowerCase() === templateId.toLowerCase()) {
      return v;
    }
  }
  return null;
}
