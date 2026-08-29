import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { resetAllArenaHype } from "../../db/queries"

export const resethypeCommand = {
    data: new SlashCommandBuilder()
        .setName("resethype")
        .setDescription("Reset arena hype for all users to 0")
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

        try {
            await resetAllArenaHype()
            
            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("Arena Hype Reset")
                .setDescription("Successfully reset arena hype for all users to 0 and their division to 1.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: true }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Error")
                .setDescription("An error occurred while resetting arena hype.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Database error" }
        }
    }
}
