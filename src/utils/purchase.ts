import fs from "fs"
import path from "path"
import { v4 as uuidv4 } from "uuid"
import { findProfile, saveProfile } from "../db/queries"
import { findVariantEntry } from "./catalog"

const SEASON = 9

interface ProfileChange {
    changeType: string
    [key: string]: unknown
}

interface BattlePass {
    battlePassOfferId: string
    battleBundleOfferId: string
    tierOfferId: string
    paidRewards: Record<string, number>[]
    freeRewards: Record<string, number>[]
}

function loadBattlePass(): BattlePass | null {
    const bpPath = path.join(process.cwd(), "static", "battlepass", `S${SEASON}.json`)
    if (!fs.existsSync(bpPath)) {
        return null
    }
    return JSON.parse(fs.readFileSync(bpPath, "utf-8"))
}

function makeId(): string {
    return uuidv4().replace(/-/g, "")
}

function loadVariants(): Record<string, unknown>[] {
    const variantsPath = path.join(process.cwd(), "static", "shop", "variants.json")
    if (!fs.existsSync(variantsPath)) return []
    return JSON.parse(fs.readFileSync(variantsPath, "utf-8"))
}

function getMtxPrice(offer: Record<string, unknown> | null, purchaseQuantity: number): number {
    if (!offer) return 0
    const prices = offer.prices as Record<string, unknown>[] | undefined
    if (!prices || prices.length === 0) return 0
    const price = prices[0]
    const currencyType = (price.currencyType as string || "").toLowerCase()
    if (currencyType !== "mtxcurrency") return 0
    return Math.max(0, Number(price.finalPrice) || 0) * Math.max(1, purchaseQuantity)
}

export function deductMtxCurrency(
    commonCore: Record<string, unknown>,
    amount: number,
    profileChanges: ProfileChange[]
): boolean {
    if (amount <= 0) return true

    const commonCoreItems = (commonCore.items || {}) as Record<string, unknown>
    const currentPlatform = (((commonCore.stats as Record<string, unknown>)?.attributes as Record<string, unknown>)?.current_mtx_platform as string || "shared").toLowerCase()

    const matching: Array<{ key: string; item: Record<string, unknown>; qty: number }> = []
    for (const [key, item] of Object.entries(commonCoreItems)) {
        const itemData = item as Record<string, unknown>
        const templateId = (itemData.templateId as string || "").toLowerCase()
        if (!templateId.startsWith("currency:mtx")) continue

        const platform = ((itemData.attributes as Record<string, unknown>)?.platform as string || "shared").toLowerCase()
        if (platform !== currentPlatform && platform !== "shared") continue

        const qty = (itemData.quantity as number) || 0
        if (qty <= 0) continue
        matching.push({ key, item: itemData, qty })
    }

    const total = matching.reduce((s, e) => s + e.qty, 0)
    if (total < amount) return false

    let remaining = amount
    matching.sort((a, b) => b.qty - a.qty)
    for (const entry of matching) {
        if (remaining <= 0) break
        const take = Math.min(entry.qty, remaining)
        entry.item.quantity = entry.qty - take
        remaining -= take
        profileChanges.push({
            changeType: "itemQuantityChanged",
            itemId: entry.key,
            quantity: entry.item.quantity
        })
    }

    return true
}

export async function processBattlePassPurchase(
    accountId: string,
    offerId: string,
    purchaseQuantity: number,
    commonCore: Record<string, unknown>,
    athena: Record<string, unknown>,
    offer: Record<string, unknown> | null = null
): Promise<Record<string, unknown> | null> {
    const battlePass = loadBattlePass()
    if (!battlePass) return null

    const isBattlePass = offerId === battlePass.battlePassOfferId
    const isBattleBundle = offerId === battlePass.battleBundleOfferId
    const isTier = offerId === battlePass.tierOfferId

    if (!isBattlePass && !isBattleBundle && !isTier) {
        return null
    }

    const variantsData = loadVariants()
    const profileChanges: ProfileChange[] = []
    const athenaChanges: ProfileChange[] = []
    const lootList: Record<string, unknown>[] = []

    const price = getMtxPrice(offer, isTier ? purchaseQuantity : 1)
    if (price > 0) {
        const paid = deductMtxCurrency(commonCore, price, profileChanges)
        if (!paid) {
            return {
                errorCode: "errors.com.epicgames.currency.mtx.insufficient",
                errorMessage: `You cannot afford this item (${price}).`,
                messageVars: [`${price}`],
                numericErrorCode: 1040,
                originatingService: "exlo",
                intent: "prod"
            }
        }
    }

    if (!athena.stats) {
        athena.stats = { attributes: {} }
    }
    if (!(athena.stats as Record<string, unknown>).attributes) {
        (athena.stats as Record<string, unknown>).attributes = {}
    }
    if (!athena.items) {
        athena.items = {}
    }
    if (!commonCore.stats) {
        commonCore.stats = { attributes: {} }
    }
    if (!(commonCore.stats as Record<string, unknown>).attributes) {
        (commonCore.stats as Record<string, unknown>).attributes = {}
    }
    if (!commonCore.items) {
        commonCore.items = {}
    }

    const athenaAttrs = (athena.stats as Record<string, unknown>).attributes as Record<string, unknown>
    const athenaItems = athena.items as Record<string, unknown>
    const commonCoreItems = commonCore.items as Record<string, unknown>
    const commonCoreAttrs = (commonCore.stats as Record<string, unknown>).attributes as Record<string, unknown>

    if (isBattlePass || isBattleBundle) {
        if (athenaAttrs.book_purchased === true) {
            return null
        }

        let endingTier = athenaAttrs.book_level as number || 1
        athenaAttrs.book_purchased = true

        const tokenKey = `Token:Athena_S${SEASON}_NoBattleBundleOption_Token`
        const tokenData = {
            templateId: `Token:athena_s${SEASON}_nobattlebundleoption_token`,
            attributes: {
                max_level_bonus: 0,
                level: 1,
                item_seen: true,
                xp: 0,
                favorite: false
            },
            quantity: 1
        }
        commonCoreItems[tokenKey] = tokenData
        profileChanges.push({
            changeType: "itemAdded",
            itemId: tokenKey,
            item: tokenData
        })

        if (isBattleBundle) {
            athenaAttrs.book_level = Math.min((athenaAttrs.book_level as number || 1) + 25, 100)
            endingTier = athenaAttrs.book_level as number
        }

        for (let i = 0; i < endingTier; i++) {
            const freeTier = battlePass.freeRewards[i] || {}
            const paidTier = battlePass.paidRewards[i] || {}

            processRewards(freeTier, athena, commonCore, athenaChanges, profileChanges, lootList, variantsData)
            processRewards(paidTier, athena, commonCore, athenaChanges, profileChanges, lootList, variantsData)
        }

        const giftBoxId = makeId()
        const giftBox = {
            templateId: "GiftBox:gb_battlepasspurchased",
            attributes: {
                max_level_bonus: 0,
                fromAccountId: "",
                lootList: lootList
            }
        }
        commonCoreItems[giftBoxId] = giftBox
        profileChanges.push({
            changeType: "itemAdded",
            itemId: giftBoxId,
            item: giftBox
        })

        athenaChanges.push({
            changeType: "statModified",
            name: "book_purchased",
            value: athenaAttrs.book_purchased
        })
        athenaChanges.push({
            changeType: "statModified",
            name: "book_level",
            value: athenaAttrs.book_level
        })
    }

    if (isTier) {
        const startingTier = athenaAttrs.book_level as number || 1
        athenaAttrs.book_level = (startingTier) + (purchaseQuantity || 1)
        const endingTier = athenaAttrs.book_level as number

        for (let i = startingTier; i < endingTier; i++) {
            const freeTier = battlePass.freeRewards[i] || {}
            const paidTier = battlePass.paidRewards[i] || {}

            processRewards(freeTier, athena, commonCore, athenaChanges, profileChanges, lootList, variantsData)
            if (athenaAttrs.book_purchased) {
                processRewards(paidTier, athena, commonCore, athenaChanges, profileChanges, lootList, variantsData)
            }
        }

        const giftBoxId = makeId()
        const giftBox = {
            templateId: "GiftBox:gb_battlepass",
            attributes: {
                max_level_bonus: 0,
                fromAccountId: "",
                lootList: lootList
            }
        }
        commonCoreItems[giftBoxId] = giftBox
        profileChanges.push({
            changeType: "itemAdded",
            itemId: giftBoxId,
            item: giftBox
        })

        athenaChanges.push({
            changeType: "statModified",
            name: "book_level",
            value: athenaAttrs.book_level
        })
    }

    commonCore.commandRevision = ((commonCore.commandRevision as number) || 0) + 1
    commonCore.updated = new Date().toISOString()

    athena.commandRevision = ((athena.commandRevision as number) || 0) + 1
    athena.updated = new Date().toISOString()

    await saveProfile(accountId, "common_core", commonCore)
    await saveProfile(accountId, "athena", athena)

    const multiUpdate = [{
        profileRevision: athena.commandRevision,
        profileId: "athena",
        profileChangesBaseRevision: (athena.commandRevision as number) - 1,
        profileChanges: athenaChanges,
        profileCommandRevision: athena.commandRevision
    }]

    return {
        profileRevision: commonCore.commandRevision,
        profileId: "common_core",
        profileChangesBaseRevision: (commonCore.commandRevision as number) - 1,
        profileChanges: profileChanges,
        notifications: [{
            type: "CatalogPurchase",
            primary: true,
            lootResult: {
                tierGroupName: "BattlePass",
                items: lootList
            }
        }],
        profileCommandRevision: commonCore.commandRevision,
        serverTime: new Date().toISOString(),
        multiUpdate: multiUpdate,
        responseVersion: 1
    }
}

function processRewards(
    tier: Record<string, number>,
    athena: Record<string, unknown>,
    commonCore: Record<string, unknown>,
    athenaChanges: ProfileChange[],
    profileChanges: ProfileChange[],
    lootList: Record<string, unknown>[],
    variantsData: Record<string, unknown>[]
) {
    if (!tier || Object.keys(tier).length === 0) return

    if (!athena.stats) athena.stats = { attributes: {} }
    if (!(athena.stats as Record<string, unknown>).attributes) {
        (athena.stats as Record<string, unknown>).attributes = {}
    }
    if (!athena.items) athena.items = {}
    if (!commonCore.stats) commonCore.stats = { attributes: {} }
    if (!(commonCore.stats as Record<string, unknown>).attributes) {
        (commonCore.stats as Record<string, unknown>).attributes = {}
    }
    if (!commonCore.items) commonCore.items = {}

    const athenaAttrs = (athena.stats as Record<string, unknown>).attributes as Record<string, unknown>
    const athenaItems = athena.items as Record<string, unknown>
    const commonCoreItems = commonCore.items as Record<string, unknown>

    for (const [templateId, quantity] of Object.entries(tier)) {
        const lowerItem = templateId.toLowerCase()

        if (lowerItem === "token:athenaseasonxpboost") {
            athenaAttrs.season_match_boost = ((athenaAttrs.season_match_boost as number) || 0) + quantity
            athenaChanges.push({
                changeType: "statModified",
                name: "season_match_boost",
                value: athenaAttrs.season_match_boost
            })
            continue
        }

        if (lowerItem === "token:athenaseasonfriendxpboost") {
            athenaAttrs.season_friend_match_boost = ((athenaAttrs.season_friend_match_boost as number) || 0) + quantity
            athenaChanges.push({
                changeType: "statModified",
                name: "season_friend_match_boost",
                value: athenaAttrs.season_friend_match_boost
            })
            continue
        }

        if (lowerItem.startsWith("currency:mtx")) {
            for (const [key, item] of Object.entries(commonCoreItems)) {
                const itemData = item as Record<string, unknown>
                const itemTemplateId = (itemData.templateId as string || "").toLowerCase()
                if (itemTemplateId.startsWith("currency:mtx")) {
                    const attrs = itemData.attributes as Record<string, unknown>
                    const platform = (attrs?.platform as string || "shared").toLowerCase()
                    const currentPlatform = ((commonCore.stats as Record<string, unknown>)?.attributes as Record<string, unknown>)?.current_mtx_platform as string || "shared"
                    if (platform === currentPlatform.toLowerCase() || platform === "shared") {
                        itemData.quantity = ((itemData.quantity as number) || 0) + quantity
                        profileChanges.push({
                            changeType: "itemQuantityChanged",
                            itemId: key,
                            quantity: itemData.quantity
                        })
                        break
                    }
                }
            }
            lootList.push({
                itemType: templateId,
                itemGuid: templateId,
                itemProfile: "common_core",
                quantity: quantity
            })
            continue
        }

        if (lowerItem.startsWith("homebasebanner")) {
            let itemExists = false
            for (const [key, item] of Object.entries(commonCoreItems)) {
                const itemData = item as Record<string, unknown>
                if ((itemData.templateId as string || "").toLowerCase() === lowerItem) {
                    const attrs = itemData.attributes as Record<string, unknown>
                    attrs.item_seen = false
                    itemExists = true
                    profileChanges.push({
                        changeType: "itemAttrChanged",
                        itemId: key,
                        attributeName: "item_seen",
                        attributeValue: false
                    })
                    break
                }
            }
            if (!itemExists) {
                const itemId = makeId()
                const newItem = {
                    templateId: templateId,
                    attributes: { item_seen: false },
                    quantity: 1
                }
                commonCoreItems[itemId] = newItem
                profileChanges.push({
                    changeType: "itemAdded",
                    itemId: itemId,
                    item: newItem
                })
            }
            lootList.push({
                itemType: templateId,
                itemGuid: templateId,
                itemProfile: "common_core",
                quantity: quantity
            })
            continue
        }

        if (lowerItem.startsWith("athena") || lowerItem.startsWith("cosmeticvarianttoken") || lowerItem.startsWith("challengebundleschedule") || lowerItem.startsWith("token:")) {
            let itemExists = false
            for (const [key, item] of Object.entries(athenaItems)) {
                const itemData = item as Record<string, unknown>
                if ((itemData.templateId as string || "").toLowerCase() === lowerItem) {
                    const attrs = itemData.attributes as Record<string, unknown>
                    attrs.item_seen = false
                    itemExists = true
                    athenaChanges.push({
                        changeType: "itemAttrChanged",
                        itemId: key,
                        attributeName: "item_seen",
                        attributeValue: false
                    })
                    break
                }
            }
            if (!itemExists) {
                const itemId = makeId()
                const entry = findVariantEntry(variantsData, templateId)
                const variants = entry ? entry.variants : []
                const newItem = {
                    templateId: templateId,
                    attributes: {
                        max_level_bonus: 0,
                        level: 1,
                        item_seen: false,
                        xp: 0,
                        variants: variants,
                        favorite: false
                    },
                    quantity: quantity
                }
                athenaItems[itemId] = newItem
                athenaChanges.push({
                    changeType: "itemAdded",
                    itemId: itemId,
                    item: newItem
                })
            }
            lootList.push({
                itemType: templateId,
                itemGuid: templateId,
                itemProfile: "athena",
                quantity: quantity
            })
            continue
        }

        if (lowerItem.startsWith("accountresource:")) {
            lootList.push({
                itemType: templateId,
                itemGuid: templateId,
                itemProfile: "common_core",
                quantity: quantity
            })
            continue
        }

        const itemId = makeId()
        const entry = findVariantEntry(variantsData, templateId)
        const variants = entry ? entry.variants : []
        const newItem = {
            templateId: templateId,
            attributes: {
                item_seen: false,
                variants: variants
            },
            quantity: quantity
        }
        athenaItems[itemId] = newItem
        athenaChanges.push({
            changeType: "itemAdded",
            itemId: itemId,
            item: newItem
        })
        lootList.push({
            itemType: templateId,
            itemGuid: templateId,
            itemProfile: "athena",
            quantity: quantity
        })
    }
}

export async function processRegularPurchase(
    accountId: string,
    offer: Record<string, unknown>,
    purchaseQuantity: number,
    commonCore: Record<string, unknown>,
    athena: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const variantsData = loadVariants()
    const profileChanges: ProfileChange[] = []
    const athenaChanges: ProfileChange[] = []
    const lootList: Record<string, unknown>[] = []

    const athenaItems = athena.items as Record<string, unknown>

    const finalPrice = getMtxPrice(offer, purchaseQuantity)
    if (finalPrice > 0) {
        const paid = deductMtxCurrency(commonCore, finalPrice, profileChanges)
        if (!paid) {
            return {
                errorCode: "errors.com.epicgames.currency.mtx.insufficient",
                errorMessage: `You cannot afford this item (${finalPrice}).`,
                messageVars: [`${finalPrice}`],
                numericErrorCode: 1040,
                originatingService: "exlo",
                intent: "prod"
            }
        }
    }

    const itemGrants = offer.itemGrants as Record<string, unknown>[]
    if (itemGrants) {
        for (const grant of itemGrants) {
            const templateId = grant.templateId as string
            const itemId = makeId()
            const entry = findVariantEntry(variantsData, templateId)
            const variants = entry ? entry.variants : []

            const newItem = {
                templateId: templateId,
                attributes: {
                    max_level_bonus: 0,
                    level: 1,
                    item_seen: false,
                    xp: 0,
                    variants: variants,
                    favorite: false
                },
                quantity: grant.quantity || 1
            }
            athenaItems[itemId] = newItem
            athenaChanges.push({
                changeType: "itemAdded",
                itemId: itemId,
                item: newItem
            })
            lootList.push({
                itemType: templateId,
                itemGuid: itemId,
                itemProfile: "athena",
                quantity: grant.quantity || 1
            })
        }
    }

    commonCore.commandRevision = ((commonCore.commandRevision as number) || 0) + 1
    commonCore.updated = new Date().toISOString()

    athena.commandRevision = ((athena.commandRevision as number) || 0) + 1
    athena.updated = new Date().toISOString()

    await saveProfile(accountId, "common_core", commonCore)
    await saveProfile(accountId, "athena", athena)

    const multiUpdate = [{
        profileRevision: athena.commandRevision,
        profileId: "athena",
        profileChangesBaseRevision: (athena.commandRevision as number) - 1,
        profileChanges: athenaChanges,
        profileCommandRevision: athena.commandRevision
    }]

    return {
        profileRevision: commonCore.commandRevision,
        profileId: "common_core",
        profileChangesBaseRevision: (commonCore.commandRevision as number) - 1,
        profileChanges: profileChanges,
        notifications: [{
            type: "CatalogPurchase",
            primary: true,
            lootResult: {
                items: lootList
            }
        }],
        profileCommandRevision: commonCore.commandRevision,
        serverTime: new Date().toISOString(),
        multiUpdate: multiUpdate,
        responseVersion: 1
    }
}

export function getBattlePassOfferIds(): { battlePassOfferId: string, battleBundleOfferId: string, tierOfferId: string } | null {
    const battlePass = loadBattlePass()
    if (!battlePass) return null
    return {
        battlePassOfferId: battlePass.battlePassOfferId,
        battleBundleOfferId: battlePass.battleBundleOfferId,
        tierOfferId: battlePass.tierOfferId
    }
}
