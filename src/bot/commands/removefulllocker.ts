import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByUsername, saveProfile } from "../../db/queries"
import { logger } from "../../utils/helpers"
import fs from "fs"
import path from "path"

export const removefulllockerCommand = {
    data: new SlashCommandBuilder()
        .setName("removeelite")
        .setDescription("Remove elite donator.")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to reset locker for")
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

        const defaultAthenaPath = path.join(process.cwd(), "static", "profiles", "athena.json")
        if (!fs.existsSync(defaultAthenaPath)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Server Error")
                .setDescription("Default athena profile not found on server.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Server error" }
        }

        const defaultAthena = JSON.parse(fs.readFileSync(defaultAthenaPath, "utf-8"))
        defaultAthena.accountId = user.accountId
        defaultAthena.created = new Date().toISOString()
        defaultAthena.updated = new Date().toISOString()

        await saveProfile(user.accountId, "athena", defaultAthena)


        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("Elite Donator Removed")
            .setDescription(`**${username}**'s locker has been reset to default.`)
            .addFields(
                { name: "Account ID", value: `\`${user.accountId}\``, inline: true },
                { name: "Removed By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
