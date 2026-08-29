import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, saveProfile } from "../../db/queries"
import fs from "fs"
import path from "path"

export const removepremiumdonatorCommand = {
    data: new SlashCommandBuilder()
        .setName("removepremiumdonator")
        .setDescription("Remove Premium Donator items from a user")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to remove items from")
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

        const baseAthenaPath = path.join(process.cwd(), "static", "profiles", "athena.json")
        if (!fs.existsSync(baseAthenaPath)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Server Error")
                .setDescription("Base athena profile not found on server.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Server error" }
        }

        const baseAthena = JSON.parse(fs.readFileSync(baseAthenaPath, "utf-8"))
        baseAthena.accountId = user.accountId
        baseAthena.created = new Date().toISOString()
        baseAthena.updated = new Date().toISOString()

        await saveProfile(user.accountId, "athena", baseAthena)

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("Premium donator and full locker removed")
            .setDescription(`Reset **${username}**'s profile.`)
            .addFields(
                { name: "Removed By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
