import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, findProfile, saveProfile } from "../../db/queries"
import { v4 as uuidv4 } from "uuid"
import fs from "fs"
import path from "path"

function makeId(): string {
    return uuidv4().replace(/-/g, "")
}

function loadVariants(): Record<string, unknown>[] {
    const variantsPath = path.join(process.cwd(), "static", "shop", "variants.json")
    if (!fs.existsSync(variantsPath)) return []
    return JSON.parse(fs.readFileSync(variantsPath, "utf-8"))
}

function findVariantEntry(variantsData: Record<string, unknown>[], templateId: string): Record<string, unknown> | null {
    const lower = templateId.toLowerCase()
    for (const entry of variantsData) {
        if ((entry.templateId as string || "").toLowerCase() === lower) {
            return entry
        }
    }
    return null
}

export const giveitemCommand = {
    data: new SlashCommandBuilder()
        .setName("giveitem")
        .setDescription("Give a specific item to a user (Admin only)")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to give the item to")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("item")
                .setDescription("The item template ID (e.g., AthenaCharacter:CID_001_Athena_Commando_F_Default)")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction: ChatInputCommandInteraction) {
        const member = interaction.member
        if (!member || !("permissions" in member) || !(member.permissions as any).has(PermissionFlagsBits.Administrator)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Access Denied")
                .setDescription("You must be an **Administrator** to use this command.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Access denied" }
        }

        const username = interaction.options.getString("username", true)
        const itemTemplateId = interaction.options.getString("item", true)

        const user = await findUserByUsername(username)
        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("User Not Found")
                .setDescription(`No user found with username **${username}**`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "User not found" }
        }

        const athena = await findProfile(user.accountId, "athena")
        if (!athena) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Profile Not Found")
                .setDescription(`Could not find athena profile for **${username}**`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Profile not found" }
        }

        if (!athena.items) {
            athena.items = {}
        }

        const items = athena.items as Record<string, unknown>

        const lowerItem = itemTemplateId.toLowerCase()
        for (const [, item] of Object.entries(items)) {
            const itemData = item as Record<string, unknown>
            if ((itemData.templateId as string || "").toLowerCase() === lowerItem) {
                const embed = new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setTitle("Item Already Owned")
                    .setDescription(`**${username}** already has this item: \`${itemTemplateId}\``)
                    .setTimestamp()
                await interaction.reply({ embeds: [embed], flags: 64 })
                return
            }
        }

        const variantsData = loadVariants()
        const entry = findVariantEntry(variantsData, itemTemplateId)
        const variants = entry ? entry.variants : []

        const itemId = makeId()
        const newItem = {
            templateId: itemTemplateId,
            attributes: {
                max_level_bonus: 0,
                level: 1,
                item_seen: false,
                xp: 0,
                variants: variants,
                favorite: false
            },
            quantity: 1
        }

        items[itemId] = newItem
        athena.commandRevision = ((athena.commandRevision as number) || 0) + 1
        athena.updated = new Date().toISOString()

        await saveProfile(user.accountId, "athena", athena)

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("Item Granted")
            .setDescription(`Successfully gave item to **${username}**`)
            .addFields(
                { name: "Item", value: `\`${itemTemplateId}\``, inline: false },
                { name: "Account ID", value: user.accountId, inline: true }
            )
            .setTimestamp()

        await interaction.reply({ embeds: [embed] })
    }
}
