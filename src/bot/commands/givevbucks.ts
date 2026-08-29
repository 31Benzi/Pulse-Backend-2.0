import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, findProfile, saveProfile } from "../../db/queries"

export const givevbucksCommand = {
    data: new SlashCommandBuilder()
        .setName("givevbucks")
        .setDescription("Give V-Bucks to a user")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to give V-Bucks to")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("amount")
                .setDescription("The amount of V-Bucks to add")
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

        const mtxKey = "Currency:MtxPurchased".toLowerCase()
        let currentAmount = 0

        if (items[mtxKey]) {
            const mtxItem = items[mtxKey] as Record<string, unknown>
            currentAmount = (mtxItem.quantity as number) || 0
        }

        const newAmount = currentAmount + amount

        items[mtxKey] = {
            templateId: "Currency:MtxPurchased",
            attributes: {
                platform: "Shared"
            },
            quantity: newAmount
        }

        commonCore.items = items
        commonCore.updated = new Date().toISOString()

        await saveProfile(user.accountId, "common_core", commonCore)

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("V-Bucks Added")
            .setDescription(`Added **${amount.toLocaleString()}** V-Bucks to **${username}**`)
            .addFields(
                { name: "Previous Balance", value: currentAmount.toLocaleString(), inline: true },
                { name: "New Balance", value: newAmount.toLocaleString(), inline: true },
                { name: "Given By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
