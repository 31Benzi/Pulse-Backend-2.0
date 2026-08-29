import type { Context } from "hono";
import fs from "fs";
import path from "path";
import { getItemShop, getOfferId } from "../utils/catalog";
import { findFriendsByAccountId, findProfile } from "../db/queries";
import { sendError } from "../utils/helpers";
import type { FriendEntry } from "../db/schema/friends";

let keychain: string[] | null = null;

export async function getKeychainHandler(c: Context) {
  if (!keychain) {
    const data = fs.readFileSync(path.join(process.cwd(), "static", "shop", "keychain.json"), "utf-8");
    keychain = JSON.parse(data);
  }

  return c.json(keychain);
}

export async function getCatalog(c: Context) {
  const response = await getItemShop();
  return c.json(response);
}

export async function getBulkCatalog(c: Context) {
  const offers: Record<string, Record<string, unknown>> = {
    "offer://MtxPack1000": {
      basePrice: 99,
      basePriceCurrencyCode: "USD",
      creationDate: "0000-00-00T00:00:00.000Z",
      currencyCode: "USD",
      currentPrice: 99,
      description: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      id: "offer://MtxPack1000",
      longDescription: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      price: 99,
      shortDescription: "",
      title: "1,000 V-Bucks"
    },
    "offer://MtxPack2800": {
      basePrice: 249,
      basePriceCurrencyCode: "USD",
      creationDate: "0000-00-00T00:00:00.000Z",
      currencyCode: "USD",
      currentPrice: 249,
      description: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      id: "offer://MtxPack2800",
      longDescription: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      price: 249,
      shortDescription: "",
      title: "2,800 V-Bucks"
    },
    "offer://MtxPack7500": {
      basePrice: 595,
      basePriceCurrencyCode: "USD",
      creationDate: "0000-00-00T00:00:00.000Z",
      currencyCode: "USD",
      currentPrice: 595,
      description: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      id: "offer://MtxPack7500",
      longDescription: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      price: 595,
      shortDescription: "",
      title: "7,500 V-Bucks"
    },
    "offer://MtxPack13500": {
      basePrice: 990,
      basePriceCurrencyCode: "USD",
      creationDate: "0000-00-00T00:00:00.000Z",
      currencyCode: "USD",
      currentPrice: 990,
      description: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      id: "offer://MtxPack13500",
      longDescription: "Fortnite V-Bucks are a premium in-game currency purchased with real money and used to unlock skins, emotes, pickaxes, Battle Passes, and cosmetic bundles.",
      price: 990,
      shortDescription: "",
      title: "13,500 V-Bucks"
    }
  };

  const ids = c.req.queries("id") || [];
  const response: Record<string, Record<string, unknown>> = {};

  for (const id of ids) {
    if (offers[id]) {
      response[id] = offers[id];
    }
  }

  return c.json(response);
}

export async function giftCheckEligibility(c: Context) {
  const senderId = c.get("accountId");
  const recipientId = c.req.param("recipientId");
  const offerId = c.req.param("offerId");

  const offerResult = await getOfferId(offerId);
  if (!offerResult) {
    return sendError(c, "errors.com.epicgames.fortnite.id_invalid", `Offer ID (id: "${offerId}") not found`, [offerId], 16027, null, 400);
  }

  if (recipientId !== senderId) {
    const senderFriends = await findFriendsByAccountId(senderId);
    const isFriend = senderFriends?.accepted.some((f: FriendEntry) => f.accountId === recipientId);
    if (!isFriend) {
      return sendError(c, "errors.com.epicgames.friends.no_relationship", `User ${senderId} is not friends with ${recipientId}`, [senderId, recipientId], 28004, null, 403);
    }
  }

  const athena = await findProfile(recipientId, "athena");
  const athenaItems = (athena?.items as Record<string, { templateId?: string }>) || {};
  const itemGrants = (offerResult.offer.itemGrants as Record<string, unknown>[]) || [];

  for (const grant of itemGrants) {
    const gtpl = ((grant.templateId as string) || "").toLowerCase();
    for (const existing of Object.values(athenaItems)) {
      if ((existing.templateId || "").toLowerCase() === gtpl) {
        return sendError(
          c,
          "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
          `Could not purchase catalog offer ${offerResult.offer.devName}, item ${grant.templateId}`,
          [offerResult.offer.devName, grant.templateId as string],
          28004,
          null,
          403
        );
      }
    }
  }

  return c.json({
    price: (offerResult.offer.prices as Record<string, unknown>[])[0],
    items: itemGrants
  });
}
