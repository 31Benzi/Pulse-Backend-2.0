import type { Context } from "hono";
import fs from "fs";
import path from "path";
import { findUserByAccountId, findProfile, createProfiles, saveProfile, findFriendsByAccountId } from "../db/queries";
import { sendError, getVersionInfo, generateUuid, logger, sendXmppMessage } from "../utils/helpers";
import { getItemShop, getOfferId, findVariantEntry } from "../utils/catalog";
import type { FriendEntry } from "../db/schema/friends";
import { processBattlePassPurchase, processRegularPurchase, getBattlePassOfferIds, deductMtxCurrency } from "../utils/purchase";

interface ProfileChange {
  changeType: string;
  [key: string]: unknown;
}

interface ProfileData {
  profileId?: string;
  accountId?: string;
  commandRevision?: number;
  rvn?: number;
  updated?: string;
  created?: string;
  items?: Record<string, ItemData>;
  stats?: {
    attributes?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

interface ItemData {
  templateId?: string;
  attributes?: Record<string, unknown>;
  quantity?: number;
  [key: string]: unknown;
}

function generateProfileResponse(profile: ProfileData | Record<string, unknown>, profileId: string, rvn: number, changes: ProfileChange[]) {
  const p = profile as ProfileData;
  const profileRvn = (p.rvn as number) || rvn;
  const cmdRev = (p.commandRevision as number) || rvn;
  return {
    profileRevision: profileRvn,
    profileId,
    profileChangesBaseRevision: profileRvn - 1,
    profileChanges: changes,
    profileCommandRevision: cmdRev,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  };
}

function fullProfileUpdate(profile: Record<string, unknown>): ProfileChange {
  return {
    changeType: "fullProfileUpdate",
    profile
  };
}

function asProfile(p: Record<string, unknown> | undefined): ProfileData | undefined {
  return p as ProfileData | undefined;
}

async function resolveProfile(accountId: string, profileId: string, username?: string): Promise<Record<string, unknown> | null> {
  let profile = await findProfile(accountId, profileId);

  if (!profile) {
    await createProfiles(accountId, username);
    profile = await findProfile(accountId, profileId);
  }

  if (!profile) {
    const templatePath = path.join(process.cwd(), "static", "profiles", `${profileId}.json`);
    if (fs.existsSync(templatePath)) {
      const templateData = fs.readFileSync(templatePath, "utf-8");
      profile = JSON.parse(templateData);
    } else {
      profile = {
        _id: generateUuid(),
        accountId,
        profileId,
        version: "no_version",
        items: {},
        stats: { attributes: {} },
        commandRevision: 1,
        rvn: 1,
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
    }
  }

  if (!profile) return null;

  profile.profileId = profile.profileId || profileId;
  profile.accountId = profile.accountId || accountId;

  if (profileId === "common_core") {
    const stats = (profile.stats || { attributes: {} }) as Record<string, Record<string, unknown>>;
    if (!stats.attributes) stats.attributes = {};
    const attrs = stats.attributes;
    attrs.allowed_to_send_gifts = true;
    attrs.mfa_enabled = true;
    if (attrs.allowed_to_receive_gifts === undefined) attrs.allowed_to_receive_gifts = true;
    if (attrs.gift_history === undefined) attrs.gift_history = {};
    if (!attrs.current_mtx_platform) attrs.current_mtx_platform = "EpicPC";
    profile.stats = stats;
  }

  return profile;
}

export async function queryProfile(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const user = await findUserByAccountId(accountId);
  if (!user || user.banned) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Account ${accountId} not found`, [accountId], 18007, null, 404);
  }

  const profile = await resolveProfile(accountId, profileId, user.username);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }
  profile.commandRevision = profile.commandRevision || 1;
  profile.rvn = profile.rvn || 1;

  if (profileId === "athena") {
    const userAgent = c.req.header("User-Agent") || "";
    const versionInfo = getVersionInfo(userAgent);
    
    const stats = (profile.stats || { attributes: {} }) as Record<string, Record<string, unknown>>;
    if (!stats.attributes) stats.attributes = {};
    stats.attributes.season_num = versionInfo.season;
    profile.stats = stats;
  }

  if (profile.rvn === profile.commandRevision) {
    profile.rvn = (profile.rvn as number) + 1;
  }

  await saveProfile(accountId, profileId, profile);

  if (profileId === "common_core") {
    const a = ((profile.stats as Record<string, Record<string, unknown>>)?.attributes) || {};
    //logger.info(`[mcp] queryProfile common_core: send=${a.allowed_to_send_gifts} recv=${a.allowed_to_receive_gifts} mfa=${a.mfa_enabled} platform=${a.current_mtx_platform}`);
  }

  return c.json(generateProfileResponse(profile, profileId, profile.rvn as number, [fullProfileUpdate(profile)]));
}

export async function clientQuestLogin(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const user = await findUserByAccountId(accountId);
  const profile = await resolveProfile(accountId, profileId, user?.username);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = (profile.commandRevision as number) || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}

export async function setMtxPlatform(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  const profile = await findProfile(accountId, profileId);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = (profile.commandRevision as number) || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}

export async function setCosmeticLockerSlot(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { lockerItem, category, itemToSlot, slotIndex, variantUpdates } = body;

  const profile = await findProfile(accountId, profileId);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const items = profile.items as Record<string, Record<string, unknown>>;
  const stats = profile.stats as Record<string, Record<string, unknown>>;
  const attributes = stats?.attributes as Record<string, unknown> || {};

  let itemToSlotId = "";
  if (itemToSlot) {
    if (items[itemToSlot]) {
      itemToSlotId = itemToSlot;
    } else {
      const lower = itemToSlot.toLowerCase();
      for (const [itemId, item] of Object.entries(items || {})) {
        const tid = (item as Record<string, unknown>).templateId as string;
        if (tid === itemToSlot || tid?.toLowerCase() === lower) {
          itemToSlotId = itemId;
          break;
        }
      }
    }
  }

  if (items && items[lockerItem]) {
    const locker = items[lockerItem];
    const lockerAttrs = locker.attributes as Record<string, unknown>;
    const lockerSlotsData = lockerAttrs?.locker_slots_data as Record<string, unknown>;
    const slots = lockerSlotsData?.slots as Record<string, Record<string, unknown>>;

    if (slots && slots[category]) {
      const categorySlot = slots[category];
      
      if (variantUpdates && variantUpdates.length > 0 && slotIndex >= 0) {
        if (!categorySlot.activeVariants) {
          categorySlot.activeVariants = [];
        }
        const activeVariants = categorySlot.activeVariants as Record<string, unknown>[];
        while (activeVariants.length <= slotIndex) {
          activeVariants.push({ variants: [] });
        }
        activeVariants[slotIndex] = { variants: variantUpdates };
      }

      const categoryLower = category.toLowerCase();
      
      if (category === "Dance") {
        if (!categorySlot.items) {
          categorySlot.items = ["", "", "", "", "", ""];
        }
        const slotItems = categorySlot.items as string[];
        if (slotIndex >= 0 && slotIndex <= 5) {
          slotItems[slotIndex] = itemToSlot || "";

          if (!attributes.favorite_dance) {
            attributes.favorite_dance = ["", "", "", "", "", ""];
          }
          const favDance = attributes.favorite_dance as string[];
          favDance[slotIndex] = itemToSlotId;

          changes.push({
            changeType: "statModified",
            name: "favorite_dance",
            value: favDance
          });
        }
      } else if (category === "ItemWrap") {
        if (!categorySlot.items) {
          categorySlot.items = ["", "", "", "", "", "", ""];
        }
        const slotItems = categorySlot.items as string[];
        if (!attributes.favorite_itemwraps) {
          attributes.favorite_itemwraps = ["", "", "", "", "", "", ""];
        }
        const favWraps = attributes.favorite_itemwraps as string[];

        if (slotIndex === -1) {
          for (let i = 0; i < 7; i++) {
            while (slotItems.length <= i) slotItems.push("");
            while (favWraps.length <= i) favWraps.push("");
            slotItems[i] = itemToSlot || "";
            favWraps[i] = itemToSlotId;
          }
        } else if (slotIndex >= 0) {
          while (slotItems.length <= slotIndex) slotItems.push("");
          while (favWraps.length <= slotIndex) favWraps.push("");
          slotItems[slotIndex] = itemToSlot || "";
          favWraps[slotIndex] = itemToSlotId;
        }

        changes.push({
          changeType: "statModified",
          name: "favorite_itemwraps",
          value: favWraps
        });
      } else {
        categorySlot.items = [itemToSlot || ""];

        const favoriteKey = `favorite_${categoryLower}`;
        attributes[favoriteKey] = itemToSlotId;

        changes.push({
          changeType: "statModified",
          name: favoriteKey,
          value: itemToSlotId
        });
      }

      changes.push({
        changeType: "itemAttrChanged",
        itemId: lockerItem,
        attributeName: "locker_slots_data",
        attributeValue: lockerSlotsData
      });
    }
  }

  if (variantUpdates && variantUpdates.length > 0 && itemToSlotId && items[itemToSlotId]) {
    const item = items[itemToSlotId];
    const itemAttrs = item.attributes as Record<string, unknown>;
    if (!itemAttrs.variants) {
      itemAttrs.variants = [];
    }
    const variants = itemAttrs.variants as Record<string, unknown>[];

    for (const variantUpdate of variantUpdates) {
      const existingVariant = variants.find((v) => v.channel === variantUpdate.channel);
      if (existingVariant) {
        existingVariant.active = variantUpdate.active;
      } else {
        variants.push(variantUpdate);
      }
    }

    changes.push({
      changeType: "itemAttrChanged",
      itemId: itemToSlotId,
      attributeName: "variants",
      attributeValue: variants
    });
  }

  if (changes.length > 0) {
    stats.attributes = attributes;
    profile.stats = stats;
    profile.rvn = ((profile.rvn as number) || 0) + 1;
    profile.commandRevision = ((profile.commandRevision as number) || 0) + 1;
    profile.updated = new Date().toISOString();
    await saveProfile(accountId, profileId, profile);
  }

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision as number, changes));
}

export async function equipBattleRoyaleCustomization(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { itemToSlot, slotName, indexWithinSlot, variantUpdates } = body;

  const profile = await findProfile(accountId, profileId);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = (profile.stats || { attributes: {} }) as Record<string, Record<string, unknown>>;
  const attributes = (stats.attributes || {}) as Record<string, unknown>;
  const items = (profile.items || {}) as Record<string, Record<string, unknown>>;

  const slotMapping: Record<string, string> = {
    "Character": "favorite_character",
    "Backpack": "favorite_backpack",
    "Pickaxe": "favorite_pickaxe",
    "Glider": "favorite_glider",
    "SkyDiveContrail": "favorite_skydivecontrail",
    "MusicPack": "favorite_musicpack",
    "LoadingScreen": "favorite_loadingscreen"
  };

  const attrName = slotMapping[slotName];

  let resolvedKey = itemToSlot || "";
  if (itemToSlot && !items[itemToSlot]) {
    const lower = itemToSlot.toLowerCase();
    for (const [key, item] of Object.entries(items)) {
      const tid = (item as Record<string, unknown>).templateId as string;
      if (tid === itemToSlot || tid?.toLowerCase() === lower) {
        resolvedKey = key;
        break;
      }
    }
  }

  if (attrName) {
    attributes[attrName] = resolvedKey;
    changes.push({
      changeType: "statModified",
      name: attrName,
      value: resolvedKey
    });
  } else if (slotName === "Dance") {
    if (!attributes.favorite_dance) {
      attributes.favorite_dance = ["", "", "", "", "", ""];
    }
    const favDance = attributes.favorite_dance as string[];
    if (indexWithinSlot !== undefined && indexWithinSlot >= 0) {
      favDance[indexWithinSlot] = resolvedKey;
    }
    changes.push({
      changeType: "statModified",
      name: "favorite_dance",
      value: favDance
    });
  } else if (slotName === "ItemWrap") {
    if (!attributes.favorite_itemwraps) {
      attributes.favorite_itemwraps = ["", "", "", "", "", "", ""];
    }
    const favWraps = attributes.favorite_itemwraps as string[];
    if (indexWithinSlot === -1) {
      for (let i = 0; i < favWraps.length; i++) {
        favWraps[i] = resolvedKey;
      }
    } else if (indexWithinSlot !== undefined && indexWithinSlot >= 0) {
      favWraps[indexWithinSlot] = resolvedKey;
    }
    changes.push({
      changeType: "statModified",
      name: "favorite_itemwraps",
      value: favWraps
    });
  }

  stats.attributes = attributes;
  profile.stats = stats;

  const lockerItem = items["exlo-loadout"];
  if (lockerItem) {
    const lockerAttrs = (lockerItem.attributes || {}) as Record<string, unknown>;
    const lockerSlotsData = (lockerAttrs.locker_slots_data || { slots: {} }) as Record<string, unknown>;
    const slots = (lockerSlotsData.slots || {}) as Record<string, Record<string, unknown>>;

    if (slots[slotName]) {
      if (slotName === "Dance") {
        if (!slots[slotName].items) slots[slotName].items = ["", "", "", "", "", ""];
        const slotItems = slots[slotName].items as string[];
        if (indexWithinSlot !== undefined && indexWithinSlot >= 0) {
          slotItems[indexWithinSlot] = itemToSlot || "";
        }
      } else if (slotName === "ItemWrap") {
        if (!slots[slotName].items) slots[slotName].items = ["", "", "", "", "", "", ""];
        const slotItems = slots[slotName].items as string[];
        if (indexWithinSlot === -1) {
          for (let i = 0; i < 7; i++) slotItems[i] = itemToSlot || "";
        } else if (indexWithinSlot !== undefined && indexWithinSlot >= 0) {
          slotItems[indexWithinSlot] = itemToSlot || "";
        }
      } else {
        slots[slotName].items = [itemToSlot || ""];
      }

      if (variantUpdates && variantUpdates.length > 0) {
        const idx = (slotName === "Dance" || slotName === "ItemWrap") ? Math.max(indexWithinSlot || 0, 0) : 0;
        if (!slots[slotName].activeVariants) slots[slotName].activeVariants = [];
        const activeVariants = slots[slotName].activeVariants as Record<string, unknown>[];
        while (activeVariants.length <= idx) activeVariants.push({ variants: [] });
        activeVariants[idx] = { variants: variantUpdates };
      }

      changes.push({
        changeType: "itemAttrChanged",
        itemId: "exlo-loadout",
        attributeName: "locker_slots_data",
        attributeValue: lockerSlotsData
      });
    }
  }

  if (variantUpdates && variantUpdates.length > 0 && resolvedKey && items[resolvedKey]) {
    const item = items[resolvedKey];
    const itemAttrs = (item.attributes || {}) as Record<string, unknown>;
    if (!itemAttrs.variants) {
      itemAttrs.variants = [];
    }
    const variants = itemAttrs.variants as Record<string, unknown>[];

    for (const variantUpdate of variantUpdates) {
      const existingVariant = variants.find((v) => v.channel === variantUpdate.channel);
      if (existingVariant) {
        existingVariant.active = variantUpdate.active;
      } else {
        variants.push(variantUpdate);
      }
    }

    item.attributes = itemAttrs;
    items[resolvedKey] = item;
    profile.items = items;

    changes.push({
      changeType: "itemAttrChanged",
      itemId: resolvedKey,
      attributeName: "variants",
      attributeValue: variants
    });
  }

  profile.commandRevision = ((profile.commandRevision as number) || 0) + 1;
  profile.rvn = ((profile.rvn as number) || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision as number, changes));
}

export async function setItemFavoriteStatusBatch(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { itemIds, itemFavStatus } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const items = profile.items || {};

  if (itemIds && itemFavStatus) {
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      const favStatus = itemFavStatus[i];

      if (items[itemId]) {
        (items[itemId].attributes as Record<string, unknown>).favorite = favStatus;
        changes.push({
          changeType: "itemAttrChanged",
          itemId,
          attributeName: "favorite",
          attributeValue: favStatus
        });
      }
    }
  }

  profile.commandRevision = ((profile.commandRevision as number) || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile);

  return c.json(generateProfileResponse(profile, profileId, (profile.commandRevision as number), changes));
}

export async function markItemSeen(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { itemIds } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const items = profile.items || {};

  if (itemIds) {
    for (const itemId of itemIds) {
      if (items[itemId]) {
        (items[itemId].attributes as Record<string, unknown>).item_seen = true;
        changes.push({
          changeType: "itemAttrChanged",
          itemId,
          attributeName: "item_seen",
          attributeValue: true
        });
      }
    }
  }

  profile.commandRevision = ((profile.commandRevision as number) || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile);

  return c.json(generateProfileResponse(profile, profileId, (profile.commandRevision as number), changes));
}

export async function setPartyAssistQuest(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { questToPinAsPartyAssist } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = profile.stats || { attributes: {} };
  const attributes = stats.attributes || {};

  attributes.party_assist_quest = questToPinAsPartyAssist || "";
  changes.push({
    changeType: "statModified",
    name: "party_assist_quest",
    value: questToPinAsPartyAssist || ""
  });
  profile.stats = { attributes };

  profile.commandRevision = ((profile.commandRevision as number) || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile);

  return c.json(generateProfileResponse(profile, profileId, (profile.commandRevision as number), changes));
}

export async function setPinnedQuests(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { pinnedQuestIds } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = profile.stats || { attributes: {} };
  const attributes = stats.attributes || {};

  attributes.pinned_quest = pinnedQuestIds?.[0] || "";
  changes.push({
    changeType: "statModified",
    name: "pinned_quest",
    value: pinnedQuestIds?.[0] || ""
  });
  profile.stats = { attributes };

  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function setReceiveGiftsEnabled(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  if (profileId !== "common_core") {
    return sendError(c, "errors.com.epicgames.modules.profiles.invalid_command", `SetReceiveGiftsEnabled is not valid on ${profileId} profile`, ["SetReceiveGiftsEnabled", profileId], 12801, null, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const { bReceiveGifts } = body as { bReceiveGifts?: unknown };

  if (typeof bReceiveGifts !== "boolean") {
    return sendError(c, "errors.com.epicgames.validation.validation_failed", "Validation Failed. 'bReceiveGifts' is not a boolean.", ["bReceiveGifts"], 1040, null, 400);
  }

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const userAgent = c.req.header("User-Agent") || "";
  const memory = getVersionInfo(userAgent);
  const baseRevision = profile.rvn || 0;
  const profileRevisionCheck = memory.build >= 12.20 ? (profile.commandRevision || 0) : baseRevision;
  const queryRevision = Number(c.req.query("rvn"));

  if (!profile.stats) profile.stats = { attributes: {} };
  if (!profile.stats.attributes) profile.stats.attributes = {};
  profile.stats.attributes.allowed_to_receive_gifts = bReceiveGifts;

  let changes: ProfileChange[] = [{
    changeType: "statModified",
    name: "allowed_to_receive_gifts",
    value: bReceiveGifts
  }];

  profile.rvn = baseRevision + 1;
  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  if (!isNaN(queryRevision) && queryRevision !== profileRevisionCheck) {
    changes = [{ changeType: "fullProfileUpdate", profile: profile as Record<string, unknown> }];
  }

  return c.json({
    profileRevision: profile.rvn,
    profileId,
    profileChangesBaseRevision: baseRevision,
    profileChanges: changes,
    profileCommandRevision: profile.commandRevision,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  });
}

export async function purchaseCatalogEntry(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  const body = await c.req.json();
  const { offerId, purchaseQuantity, currency, expectedTotalPrice } = body;

  const user = await findUserByAccountId(accountId);
  if (!user) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Account not found`, [], 18007, null, 404);
  }

  const commonCore = asProfile(await findProfile(accountId, "common_core"));
  const athena = asProfile(await findProfile(accountId, "athena"));

  if (!commonCore || !athena) {
    return sendError(c, "errors.com.exlo.account.profile_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const shop = await getItemShop();
  let offer: Record<string, unknown> | null = null;
  const storefronts = (shop as Record<string, unknown>).storefronts as Array<Record<string, unknown>> || [];

  for (const storefront of storefronts) {
    const entries = storefront.catalogEntries as Array<Record<string, unknown>> || [];
    for (const entry of entries) {
      if (entry.offerId === offerId) {
        offer = entry;
        break;
      }
    }
    if (offer) break;
  }

  const bpOffers = getBattlePassOfferIds();
  if (bpOffers) {
    if (offerId === bpOffers.battlePassOfferId || offerId === bpOffers.battleBundleOfferId || offerId === bpOffers.tierOfferId) {
      const result = await processBattlePassPurchase(accountId, offerId, purchaseQuantity || 1, commonCore as Record<string, unknown>, athena as Record<string, unknown>, offer);
      if (result) {
        return c.json(result);
      }
    }
  }

  if (!offer) {
    return sendError(c, "errors.com.exlo.catalog.offer_not_found", `Offer ${offerId} not found`, [offerId], 28001, null, 404);
  }

  const result = await processRegularPurchase(accountId, offer, purchaseQuantity || 1, commonCore as Record<string, unknown>, athena as Record<string, unknown>);
  return c.json(result);
}

const VALID_GIFT_BOXES = [
  "GiftBox:gb_default",
  "GiftBox:gb_giftwrap1",
  "GiftBox:gb_giftwrap2",
  "GiftBox:gb_giftwrap3"
];

function deductMtxForGift(commonCore: ProfileData, amount: number, changes: ProfileChange[]): boolean {
  return deductMtxCurrency(commonCore as Record<string, unknown>, amount, changes as unknown as Parameters<typeof deductMtxCurrency>[2]);
}

export async function giftCatalogEntry(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  if (profileId !== "common_core") {
    return sendError(c, "errors.com.epicgames.modules.profiles.invalid_command", `GiftCatalogEntry is not valid on ${profileId} profile`, ["GiftCatalogEntry", profileId], 12801, null, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  logger.info(`[Gift] request from ${accountId} body=${JSON.stringify(body)}`);
  const { offerId, receiverAccountIds, giftWrapTemplateId, personalMessage } = body as {
    offerId?: string;
    receiverAccountIds?: string[];
    giftWrapTemplateId?: string;
    personalMessage?: string;
  };

  const missing: string[] = [];
  if (!offerId) missing.push("offerId");
  if (!receiverAccountIds) missing.push("receiverAccountIds");
  if (!giftWrapTemplateId) missing.push("giftWrapTemplateId");
  if (missing.length > 0) {
    logger.warn(`[Gift] missing fields: ${missing.join(", ")}`);
    return sendError(c, "errors.com.epicgames.validation.validation_failed", `Validation Failed. [${missing.join(", ")}] field(s) is missing.`, [`[${missing.join(", ")}]`], 1040, null, 400);
  }

  if (typeof offerId !== "string") {
    return sendError(c, "errors.com.epicgames.validation.validation_failed", "Validation Failed. 'offerId' is not a string.", ["offerId"], 1040, null, 400);
  }
  if (!Array.isArray(receiverAccountIds)) {
    return sendError(c, "errors.com.epicgames.validation.validation_failed", "Validation Failed. 'receiverAccountIds' is not an array.", ["receiverAccountIds"], 1040, null, 400);
  }
  if (typeof giftWrapTemplateId !== "string") {
    return sendError(c, "errors.com.epicgames.validation.validation_failed", "Validation Failed. 'giftWrapTemplateId' is not a string.", ["giftWrapTemplateId"], 1040, null, 400);
  }
  const message = typeof personalMessage === "string" ? personalMessage : "";
  if (message.length > 100) {
    return sendError(c, "errors.com.epicgames.string.length_check", "personalMessage is longer than 100 characters.", [], 16027, null, 400);
  }

  if (!VALID_GIFT_BOXES.includes(giftWrapTemplateId)) {
    logger.warn(`[Gift] invalid giftbox: ${giftWrapTemplateId}`);
    return sendError(c, "errors.com.epicgames.giftbox.invalid", "Invalid giftbox.", [], 16027, null, 400);
  }

  if (receiverAccountIds.length < 1 || receiverAccountIds.length > 5) {
    logger.warn(`[Gift] receiver count out of range: ${receiverAccountIds.length}`);
    return sendError(c, "errors.com.epicgames.item.quantity.range_check", "You must gift to between 1 and 5 people.", [], 16027, null, 400);
  }

  const seen = new Set<string>();
  for (const id of receiverAccountIds) {
    if (typeof id !== "string") {
      return sendError(c, "errors.com.epicgames.array.invalid_string", "receiverAccountIds contains a non-string value.", [], 16027, null, 400);
    }
    if (seen.has(id)) {
      return sendError(c, "errors.com.epicgames.array.duplicate_found", "Duplicate accountIds in receiverAccountIds.", [], 16027, null, 400);
    }
    seen.add(id);
  }

  const senderFriends = await findFriendsByAccountId(accountId);
  for (const receiverId of receiverAccountIds) {
    if (receiverId === accountId) continue;
    const isFriend = senderFriends?.accepted.some((f: FriendEntry) => f.accountId === receiverId);
    if (!isFriend) {
      logger.warn(`[Gift] ${accountId} not friends with ${receiverId}`);
      return sendError(c, "errors.com.epicgames.friends.no_relationship", `User ${accountId} is not friends with ${receiverId}`, [accountId, receiverId], 28004, null, 403);
    }
  }

  const offerResult = await getOfferId(offerId);
  if (!offerResult) {
    logger.warn(`[Gift] offer not found: ${offerId}`);
    return sendError(c, "errors.com.epicgames.fortnite.id_invalid", `Offer ID (id: '${offerId}') not found`, [offerId], 16027, null, 400);
  }

  const offer = offerResult.offer as unknown as Record<string, unknown>;
  const prices = (offer.prices as Record<string, unknown>[]) || [];
  const firstPrice = prices[0];
  const currencyType = ((firstPrice?.currencyType as string) || "").toLowerCase();
  const finalPrice = Number(firstPrice?.finalPrice) || 0;
  const totalPrice = currencyType === "mtxcurrency" ? finalPrice * receiverAccountIds.length : 0;

  const senderProfile = asProfile(await findProfile(accountId, "common_core"));
  if (!senderProfile) {
    return sendError(c, "errors.com.exlo.account.profile_not_found", "Profile not found", [], 18007, null, 404);
  }

  const userAgent = c.req.header("User-Agent") || "";
  const memory = getVersionInfo(userAgent);
  let changes: ProfileChange[] = [];
  const baseRevision = senderProfile.rvn || 0;
  const profileRevisionCheck = memory.build >= 12.20 ? (senderProfile.commandRevision || 0) : baseRevision;
  const queryRevision = Number(c.req.query("rvn"));

  if (totalPrice > 0) {
    if (!deductMtxForGift(senderProfile, totalPrice, changes)) {
      logger.warn(`[Gift] insufficient mtx for ${accountId}, needed ${totalPrice}`);
      return sendError(c, "errors.com.epicgames.currency.mtx.insufficient", `You can not afford this item (${totalPrice}).`, [`${totalPrice}`], 1040, null, 400);
    }
  }

  const itemGrants = (offer.itemGrants as Record<string, unknown>[]) || [];

  for (const receiverId of receiverAccountIds) {
    const recvCommonCore = receiverId === accountId ? senderProfile : asProfile(await findProfile(receiverId, "common_core"));
    const recvAthena = asProfile(await findProfile(receiverId, "athena"));

    if (!recvCommonCore || !recvAthena) {
      return sendError(c, "errors.com.epicgames.user.not_found", `User ${receiverId} not found`, [receiverId], 18007, null, 404);
    }

    const allowed = (recvCommonCore.stats?.attributes?.allowed_to_receive_gifts as boolean) ?? true;
    if (!allowed) {
      return sendError(c, "errors.com.epicgames.user.gift_disabled", `User ${receiverId} has disabled receiving gifts.`, [receiverId], 28004, null, 403);
    }

    if (!recvAthena.items) recvAthena.items = {};
    if (!recvCommonCore.items) recvCommonCore.items = {};

    for (const grant of itemGrants) {
      const gtpl = ((grant.templateId as string) || "").toLowerCase();
      for (const existing of Object.values(recvAthena.items)) {
        if ((existing.templateId || "").toLowerCase() === gtpl) {
          return sendError(c, "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed", `User ${receiverId} already owns this item.`, [receiverId], 28004, null, 403);
        }
      }
    }
  }

  for (const receiverId of receiverAccountIds) {
    const isSelf = receiverId === accountId;
    const recvCommonCore = isSelf ? senderProfile : asProfile(await findProfile(receiverId, "common_core"));
    const recvAthena = asProfile(await findProfile(receiverId, "athena"));
    if (!recvCommonCore || !recvAthena) continue;

    if (!recvAthena.items) recvAthena.items = {};
    if (!recvCommonCore.items) recvCommonCore.items = {};

    const lootList: Record<string, unknown>[] = [];
    for (const grant of itemGrants) {
      const itemId = generateUuid();
      recvAthena.items[itemId] = {
        templateId: grant.templateId as string,
        attributes: { item_seen: false, variants: [] },
        quantity: 1
      };
      lootList.push({
        itemType: grant.templateId,
        itemGuid: itemId,
        itemProfile: "athena",
        quantity: 1
      });
    }

    const giftBoxId = generateUuid();
    const giftBoxItem: ItemData = {
      templateId: giftWrapTemplateId,
      attributes: {
        fromAccountId: accountId,
        lootList,
        params: { userMessage: message },
        level: 1,
        giftedOn: new Date().toISOString()
      },
      quantity: 1
    };
    recvCommonCore.items[giftBoxId] = giftBoxItem;

    if (isSelf) {
      changes.push({ changeType: "itemAdded", itemId: giftBoxId, item: giftBoxItem });
    }

    recvAthena.rvn = (recvAthena.rvn || 0) + 1;
    recvAthena.commandRevision = (recvAthena.commandRevision || 0) + 1;
    recvAthena.updated = new Date().toISOString();

    recvCommonCore.rvn = (recvCommonCore.rvn || 0) + 1;
    recvCommonCore.commandRevision = (recvCommonCore.commandRevision || 0) + 1;
    recvCommonCore.updated = new Date().toISOString();

    await saveProfile(receiverId, "athena", recvAthena as Record<string, unknown>);
    if (!isSelf) {
      await saveProfile(receiverId, "common_core", recvCommonCore as Record<string, unknown>);
    }

    sendXmppMessage(receiverId, {
      type: "com.epicgames.gift.received",
      payload: {},
      timestamp: new Date().toISOString()
    });

    logger.info(`[Gift] ${accountId} sent ${offerId} to ${receiverId}`);
  }

  if (!receiverAccountIds.includes(accountId)) {
    senderProfile.rvn = (senderProfile.rvn || 0) + 1;
    senderProfile.commandRevision = (senderProfile.commandRevision || 0) + 1;
    senderProfile.updated = new Date().toISOString();
  }
  await saveProfile(accountId, "common_core", senderProfile as Record<string, unknown>);

  if (!isNaN(queryRevision) && queryRevision !== profileRevisionCheck) {
    changes = [{ changeType: "fullProfileUpdate", profile: senderProfile as Record<string, unknown> }];
  }

  return c.json({
    profileRevision: senderProfile.rvn || 0,
    profileId: "common_core",
    profileChangesBaseRevision: baseRevision,
    profileChanges: changes,
    notifications: [],
    profileCommandRevision: senderProfile.commandRevision || 0,
    serverTime: new Date().toISOString(),
    responseVersion: 1
  });
}

export async function removeCatalogEntry(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  const profile = await findProfile(accountId, profileId);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = (profile.commandRevision as number) || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}

export async function claimMfaEnabled(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  const profile = await findProfile(accountId, profileId);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = (profile.commandRevision as number) || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}

export async function setAffiliateName(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  const body = await c.req.json();
  const { affiliateName } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = profile.stats || { attributes: {} };
  const attributes = stats.attributes || {};
  const setTime = new Date().toISOString();

  attributes.mtx_affiliate = affiliateName || "";
  attributes.mtx_affiliate_set_time = setTime;
  changes.push({
    changeType: "statModified",
    name: "mtx_affiliate",
    value: affiliateName || ""
  });
  changes.push({
    changeType: "statModified",
    name: "mtx_affiliate_set_time",
    value: setTime
  });
  profile.stats = { attributes };

  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function refundMtxPurchase(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  const profile = await findProfile(accountId, profileId);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = (profile.commandRevision as number) || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}

export async function exchangeGameCurrencyForBattlePassOffer(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { offerItemIdList } = body;

  const athena = asProfile(await findProfile(accountId, profileId));
  if (!athena) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const items = athena.items || {};

  for (const offerId of offerItemIdList || []) {
    const itemId = generateUuid();
    const templateId = offerId.replace(/^.*:/, "");

    items[itemId] = {
      templateId,
      attributes: {
        max_level_bonus: 0,
        level: 1,
        item_seen: false,
        xp: 0,
        variants: [],
        favorite: false
      },
      quantity: 1
    };

    changes.push({
      changeType: "itemAdded",
      itemId,
      item: items[itemId]
    });
  }

  athena.items = items;
  athena.commandRevision = (athena.commandRevision || 0) + 1;
  athena.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, athena as Record<string, unknown>);

  return c.json(generateProfileResponse(athena, profileId, athena.commandRevision, changes));
}

export async function bulkEquipBattleRoyaleCustomization(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { loadoutData } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = profile.stats || { attributes: {} };
  const attributes = stats.attributes || {};

  if (loadoutData) {
    for (const [slotName, value] of Object.entries(loadoutData)) {
      const slotMapping: Record<string, string> = {
        "characterDef": "favorite_character",
        "backpackDef": "favorite_backpack",
        "pickaxeDef": "favorite_pickaxe",
        "glideDef": "favorite_glider",
        "contrailDef": "favorite_skydivecontrail",
        "danceDefs": "favorite_dance",
        "itemWrapDefs": "favorite_itemwraps",
        "musicPackDef": "favorite_musicpack",
        "loadingScreenDef": "favorite_loadingscreen"
      };

      const attrName = slotMapping[slotName];
      if (attrName) {
        attributes[attrName] = value;
        changes.push({
          changeType: "statModified",
          name: attrName,
          value
        });
      }
    }
  }

  profile.stats = { attributes };
  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function copyCosmeticLoadout(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json().catch(() => ({}));
  const { sourceIndex, targetIndex, optNewNameForTarget } = body as {
    sourceIndex: number;
    targetIndex: number;
    optNewNameForTarget?: string;
  };

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const items = (profile.items || {}) as Record<string, Record<string, unknown>>;
  const stats = (profile.stats || { attributes: {} }) as Record<string, Record<string, unknown>>;
  const attributes = (stats.attributes || {}) as Record<string, unknown>;
  const loadouts = (attributes.loadouts as unknown[]) || [];
  const globalBannerIcon = (attributes.banner_icon_template as string) || "";
  const globalBannerColor = (attributes.banner_color_template as string) || "";

  if (sourceIndex === 0) {
    const baseItem = items["exlo-loadout"];
    if (!baseItem) {
      return sendError(c, "errors.com.exlo.modules.profiles.operation_forbidden", "exlo-loadout not found", [profileId], 12813, null, 403);
    }

    const targetItem = JSON.parse(JSON.stringify(baseItem)) as Record<string, unknown>;
    const targetAttrs = (targetItem.attributes || {}) as Record<string, unknown>;
    targetAttrs.locker_name = optNewNameForTarget || `Preset ${targetIndex}`;
    if (!targetAttrs.banner_icon_template) targetAttrs.banner_icon_template = globalBannerIcon;
    if (!targetAttrs.banner_color_template) targetAttrs.banner_color_template = globalBannerColor;
    targetItem.attributes = targetAttrs;

    const targetKey = `exlo${targetIndex - 1}-loadout`;
    items[targetKey] = targetItem;

    while (loadouts.length <= targetIndex) loadouts.push(null);
    loadouts[targetIndex] = targetKey;
    attributes.loadouts = loadouts;
  } else {
    if (sourceIndex >= loadouts.length) {
      return sendError(c, "errors.com.exlo.modules.profiles.operation_forbidden", "Source loadout index out of range", [profileId], 12813, null, 403);
    }

    const sourceKey = loadouts[sourceIndex] as string;
    const sourceItem = items[sourceKey];
    if (!sourceItem) {
      return sendError(c, "errors.com.exlo.modules.profiles.operation_forbidden", `Locker item ${sourceKey} not found`, [profileId], 12813, null, 403);
    }

    attributes.active_loadout_index = sourceIndex;
    attributes.last_applied_loadout = sourceKey;

    const exloItem = items["exlo-loadout"];
    if (exloItem) {
      const exloAttrs = (exloItem.attributes || {}) as Record<string, unknown>;
      const srcAttrs = (sourceItem.attributes || {}) as Record<string, unknown>;
      if (srcAttrs.locker_slots_data) {
        exloAttrs.locker_slots_data = JSON.parse(JSON.stringify(srcAttrs.locker_slots_data));
      }
      exloAttrs.banner_icon_template = (srcAttrs.banner_icon_template as string) || globalBannerIcon;
      exloAttrs.banner_color_template = (srcAttrs.banner_color_template as string) || globalBannerColor;
      exloItem.attributes = exloAttrs;
      items["exlo-loadout"] = exloItem;
    }
  }

  stats.attributes = attributes;
  profile.stats = stats;
  profile.items = items;
  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.rvn = (profile.rvn || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, [fullProfileUpdate(profile as Record<string, unknown>)]));
}

export async function setCosmeticLockerBanner(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { lockerItem, bannerIconTemplateName, bannerColorTemplateName } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const items = profile.items || {};

  if (!items[lockerItem]) {
    return c.json(generateProfileResponse(profile, profileId, profile.commandRevision || 1, []));
  }

  const locker = items[lockerItem] as ItemData;
  const lockerAttrs = (locker.attributes || {}) as Record<string, unknown>;
  if (bannerIconTemplateName) lockerAttrs.banner_icon_template = bannerIconTemplateName;
  if (bannerColorTemplateName) lockerAttrs.banner_color_template = bannerColorTemplateName;
  locker.attributes = lockerAttrs;

  const stats = (profile.stats || { attributes: {} }) as Record<string, Record<string, unknown>>;
  const attributes = (stats.attributes || {}) as Record<string, unknown>;
  if (bannerIconTemplateName) attributes.banner_icon = bannerIconTemplateName;
  if (bannerColorTemplateName) attributes.banner_color = bannerColorTemplateName;
  stats.attributes = attributes;
  profile.stats = stats;

  changes.push({
    changeType: "itemAttrChanged",
    itemId: lockerItem,
    attributeName: "banner_icon_template",
    attributeValue: lockerAttrs.banner_icon_template
  });
  changes.push({
    changeType: "itemAttrChanged",
    itemId: lockerItem,
    attributeName: "banner_color_template",
    attributeValue: lockerAttrs.banner_color_template
  });

  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function setCosmeticLockerName(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { lockerItem, name } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const items = profile.items || {};

  if (items[lockerItem]) {
    const locker = items[lockerItem] as ItemData;
    const lockerAttrs = locker.attributes as Record<string, unknown> || {};
    lockerAttrs.locker_name = name || "Locker";
    locker.attributes = lockerAttrs;
    changes.push({
      changeType: "itemAttrChanged",
      itemId: lockerItem,
      attributeName: "locker_name",
      attributeValue: lockerAttrs.locker_name
    });
  }

  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function setActiveCosmeticLoadout(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { selectedLoadoutName } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = profile.stats || { attributes: {} };
  const attributes = stats.attributes || {};

  attributes.active_loadout_index = selectedLoadoutName || 0;
  changes.push({
    changeType: "statModified",
    name: "active_loadout_index",
    value: selectedLoadoutName || 0
  });
  profile.stats = { attributes };

  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function deleteCosmeticLoadout(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json().catch(() => ({}));
  const { index, leaveNullSlot, fallbackLoadoutIndex } = body as {
    index: number;
    leaveNullSlot?: boolean;
    fallbackLoadoutIndex?: number;
  };

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const items = (profile.items || {}) as Record<string, Record<string, unknown>>;
  const stats = (profile.stats || { attributes: {} }) as Record<string, Record<string, unknown>>;
  const attributes = (stats.attributes || {}) as Record<string, unknown>;
  const loadouts = (attributes.loadouts as unknown[]) || [];
  const changes: ProfileChange[] = [];
  const loadoutName = `Fortnite${index}-loadout`;

  if (leaveNullSlot) {
    if (fallbackLoadoutIndex === -1 || fallbackLoadoutIndex === undefined) {
      delete items[loadoutName];
      if (index < loadouts.length) loadouts[index] = null;
      changes.push(fullProfileUpdate(profile as Record<string, unknown>));
    } else {
      if (fallbackLoadoutIndex >= loadouts.length) {
        return sendError(c, "errors.com.exlo.modules.profiles.operation_forbidden", "Fallback loadout index out of range", [profileId], 12813, null, 403);
      }
      const newLoadoutKey = loadouts[fallbackLoadoutIndex] as string;
      attributes.last_applied_loadout = newLoadoutKey;
      attributes.active_loadout_index = fallbackLoadoutIndex;

      const sandboxItem = items["sandbox_loadout"];
      if (sandboxItem && items[newLoadoutKey]) {
        const sandboxAttrs = (sandboxItem.attributes || {}) as Record<string, unknown>;
        const newAttrs = (items[newLoadoutKey].attributes || {}) as Record<string, unknown>;
        if (newAttrs.locker_slots_data) {
          sandboxAttrs.locker_slots_data = newAttrs.locker_slots_data;
          sandboxItem.attributes = sandboxAttrs;
          items["sandbox_loadout"] = sandboxItem;
        }
      }

      delete items[loadoutName];
      if (index < loadouts.length) loadouts[index] = null;
      changes.push(fullProfileUpdate(profile as Record<string, unknown>));
    }
  }

  attributes.loadouts = loadouts;
  stats.attributes = attributes;
  profile.stats = stats;
  profile.items = items;

  if (changes.length > 0) {
    profile.commandRevision = (profile.commandRevision || 0) + 1;
    profile.rvn = (profile.rvn || 0) + 1;
    profile.updated = new Date().toISOString();
    await saveProfile(accountId, profileId, profile as Record<string, unknown>);
  }

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision || 1, changes));
}

export async function setRandomCosmeticLoadoutFlag(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json().catch(() => ({}));
  const { random } = body as { random?: boolean };

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const items = (profile.items || {}) as Record<string, Record<string, unknown>>;
  const stats = (profile.stats || { attributes: {} }) as Record<string, Record<string, unknown>>;
  const attributes = (stats.attributes || {}) as Record<string, unknown>;
  const loadouts = (attributes.loadouts as unknown[]) || [];

  if (random) {
    const loadoutKeys = loadouts.filter(k => typeof k === "string" && k !== "" && k !== "exlo-loadout") as string[];
    if (loadoutKeys.length > 0) {
      const randomKey = loadoutKeys[Math.floor(Math.random() * loadoutKeys.length)];
      const randomLoadout = items[randomKey];
      const exloItem = items["exlo-loadout"];
      if (randomLoadout && exloItem) {
        const randomAttrs = (randomLoadout.attributes || {}) as Record<string, unknown>;
        const exloAttrs = (exloItem.attributes || {}) as Record<string, unknown>;
        if (randomAttrs.locker_slots_data) {
          exloAttrs.locker_slots_data = JSON.parse(JSON.stringify(randomAttrs.locker_slots_data));
          exloItem.attributes = exloAttrs;
          items["exlo-loadout"] = exloItem;
        }
      }
      const randomIndex = loadouts.indexOf(randomKey);
      if (randomIndex !== -1) attributes.active_loadout_index = randomIndex;
      attributes.last_applied_loadout = randomKey;
    }
  }

  stats.attributes = attributes;
  profile.stats = stats;
  profile.items = items;
  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.rvn = (profile.rvn || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, [fullProfileUpdate(profile as Record<string, unknown>)]));
}

export async function setBattleRoyaleBanner(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { homebaseBannerIconId, homebaseBannerColorId } = body;

  const commonCore = asProfile(await findProfile(accountId, "common_core"));
  if (!commonCore) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = commonCore.stats || { attributes: {} };
  const attributes = stats.attributes || {};

  attributes.banner_icon = homebaseBannerIconId || "";
  attributes.banner_color = homebaseBannerColorId || "";
  changes.push({
    changeType: "statModified",
    name: "banner_icon",
      value: homebaseBannerIconId || ""
    });
    changes.push({
      changeType: "statModified",
      name: "banner_color",
      value: homebaseBannerColorId || ""
    });
  commonCore.stats = { attributes };

  commonCore.commandRevision = (commonCore.commandRevision || 0) + 1;
  commonCore.updated = new Date().toISOString();
  await saveProfile(accountId, "common_core", commonCore as Record<string, unknown>);

  return c.json(generateProfileResponse(commonCore, "common_core", commonCore.commandRevision, changes));
}

export async function setHomebaseName(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_public";

  const body = await c.req.json();
  const { homebaseName } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const stats = profile.stats || { attributes: {} };
  const attributes = stats.attributes || {};

  attributes.homebase_name = homebaseName || "";
  changes.push({
    changeType: "statModified",
    name: "homebase_name",
    value: homebaseName || ""
  });
  profile.stats = { attributes };

  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function incrementNamedCounterStat(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = profile.commandRevision || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}

export async function updateQuestClientObjectives(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = profile.commandRevision || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}

export async function markNewQuestNotificationSent(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "athena";

  const body = await c.req.json();
  const { itemIds } = body;

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const changes: ProfileChange[] = [];
  const items = profile.items || {};

  if (itemIds) {
    for (const itemId of itemIds) {
      if (items[itemId]) {
        (items[itemId].attributes as Record<string, unknown>).sent_new_notification = true;
        changes.push({
          changeType: "itemAttrChanged",
          itemId,
          attributeName: "sent_new_notification",
          attributeValue: true
        });
      }
    }
  }

  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();
  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function getPublicAccount(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_public";

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = profile.commandRevision || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, [fullProfileUpdate(profile as Record<string, unknown>)]));
}

export async function removeGiftBox(c: Context) {
  const accountId = c.req.param("accountId");
  const profileId = c.req.query("profileId") || "common_core";

  const profile = asProfile(await findProfile(accountId, profileId));
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const { giftBoxItemId, giftBoxItemIds } = body as { giftBoxItemId?: string; giftBoxItemIds?: string[] };

  const items = profile.items || {};
  if (Object.keys(items).length === 0) {
    const rvn = profile.commandRevision || 1;
    return c.json(generateProfileResponse(profile, profileId, rvn, []));
  }

  const changes: ProfileChange[] = [];

  const removeBox = (id: string) => {
    const item = items[id];
    if (!item) return;
    
    const templateId = item.templateId as string;
    if (!templateId || !templateId.startsWith("GiftBox:")) return;

    delete items[id];
    changes.push({
      changeType: "itemRemoved",
      itemId: id
    });
  };

  if (giftBoxItemId) {
    removeBox(giftBoxItemId);
  }

  if (giftBoxItemIds) {
    for (const id of giftBoxItemIds) {
      removeBox(id);
    }
  }

  profile.rvn = (profile.rvn || 0) + 1;
  profile.commandRevision = (profile.commandRevision || 0) + 1;
  profile.updated = new Date().toISOString();

  await saveProfile(accountId, profileId, profile as Record<string, unknown>);

  return c.json(generateProfileResponse(profile, profileId, profile.commandRevision, changes));
}

export async function mcpDedicatedPost(c: Context) {
  return mcpPost(c);
}

export async function mcpPost(c: Context) {
  const accountId = c.req.param("accountId");
  const operation = c.req.param("operation");
  const profileId = c.req.query("profileId") || "athena";

  const operationHandlers: Record<string, (c: Context) => Promise<Response>> = {
    "QueryProfile": queryProfile,
    "RefreshExpeditions": queryProfile,
    "GetMcpTimeForLogin": queryProfile,
    "SetHardcoreModifier": queryProfile,
    "SetMtxPlatform": queryProfile,
    "BulkEquipBattleRoyaleCustomization": bulkEquipBattleRoyaleCustomization,
    
    "ClientQuestLogin": clientQuestLogin,
    "SetCosmeticLockerSlot": setCosmeticLockerSlot,
    "EquipBattleRoyaleCustomization": equipBattleRoyaleCustomization,
    "SetItemFavoriteStatusBatch": setItemFavoriteStatusBatch,
    "MarkItemSeen": markItemSeen,
    "SetPartyAssistQuest": setPartyAssistQuest,
    "SetPinnedQuests": setPinnedQuests,
    "SetReceiveGiftsEnabled": setReceiveGiftsEnabled,
    "PurchaseCatalogEntry": purchaseCatalogEntry,
    "GiftCatalogEntry": giftCatalogEntry,
    "RemoveCatalogEntry": removeCatalogEntry,
    "RemoveGiftBox": removeGiftBox,
    "ClaimMfaEnabled": claimMfaEnabled,
    "SetAffiliateName": setAffiliateName,
    "RefundMtxPurchase": refundMtxPurchase,
    "ExchangeGameCurrencyForBattlePassOffer": exchangeGameCurrencyForBattlePassOffer,
    "CopyAthenaLoadout": copyCosmeticLoadout,
    "CopyCosmeticLoadout": copyCosmeticLoadout,
    "SetCosmeticLockerBanner": setCosmeticLockerBanner,
    "SetCosmeticLockerName": setCosmeticLockerName,
    "SetActiveCosmeticLoadout": setActiveCosmeticLoadout,
    "DeleteCosmeticLoadout": deleteCosmeticLoadout,
    "SetRandomCosmeticLoadoutFlag": setRandomCosmeticLoadoutFlag,
    "SetBattleRoyaleBanner": setBattleRoyaleBanner,
    "SetHomebaseName": setHomebaseName,
    "IncrementNamedCounterStat": queryProfile,
    "UpdateQuestClientObjectives": updateQuestClientObjectives,
    "MarkNewQuestNotificationSent": markNewQuestNotificationSent,
    "QueryPublicProfile": getPublicAccount
  };

  const handler = operationHandlers[operation];
  if (handler) {
    return handler(c);
  }

  const user = await findUserByAccountId(accountId);
  const profile = await resolveProfile(accountId, profileId, user?.username);
  if (!profile) {
    return sendError(c, "errors.com.exlo.account.account_not_found", `Profile not found`, [], 18007, null, 404);
  }

  const rvn = (profile.commandRevision as number) || 1;

  return c.json(generateProfileResponse(profile, profileId, rvn, []));
}
