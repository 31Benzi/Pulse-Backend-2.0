import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, findProfile, saveProfile } from "../../db/queries"

export const removevbucksCommand = {
    data: new SlashCommandBuilder()
        .setName("removevbucks")
        .setDescription("Remove V-Bucks from a user")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to remove V-Bucks from")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("amount")
                .setDescription("The amount of V-Bucks to remove")
                .setRequired(true)
                .setMinValue(1)
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
        const amount = interaction.options.getInteger("amount", true)

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

        const allProfiles = await findProfile(user.accountId) as Record<string, Record<string, unknown>> | undefined
        if (!allProfiles || !allProfiles.common_core) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Profile Not Found")
                .setDescription("Could not find common_core profile.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Profile not found" }
        }

        const commonCore = allProfiles.common_core as Record<string, unknown>
        const items = (commonCore.items || {}) as Record<string, unknown>

        let totalAvailable = 0
        const mtxEntries: { key: string; item: Record<string, unknown>; qty: number }[] = []
        for (const [key, item] of Object.entries(items)) {
            const itemData = item as Record<string, unknown>
            const templateId = (itemData.templateId as string || "").toLowerCase()
            if (!templateId.startsWith("currency:mtx")) continue
            const qty = (itemData.quantity as number) || 0
            if (qty <= 0) continue
            totalAvailable += qty
            mtxEntries.push({ key, item: itemData, qty })
        }

        if (totalAvailable < amount) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Insufficient V-Bucks")
                .setDescription(`**${username}** only has **${totalAvailable.toLocaleString()}** V-Bucks.`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Insufficient V-Bucks" }
        }

        let remaining = amount
        mtxEntries.sort((a, b) => b.qty - a.qty)
        for (const entry of mtxEntries) {
            if (remaining <= 0) break
            const take = Math.min(entry.qty, remaining)
            entry.item.quantity = entry.qty - take
            remaining -= take
        }

        commonCore.items = items
        commonCore.updated = new Date().toISOString()

        await saveProfile(user.accountId, "common_core", commonCore)

        const newAmount = totalAvailable - amount

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("V-Bucks Removed")
            .setDescription(`Removed **${amount.toLocaleString()}** V-Bucks from **${username}**`)
            .addFields(
                { name: "Previous Balance", value: totalAvailable.toLocaleString(), inline: true },
                { name: "New Balance", value: newAmount.toLocaleString(), inline: true },
                { name: "Removed By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
