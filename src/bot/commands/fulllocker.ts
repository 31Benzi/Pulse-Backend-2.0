import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByUsername, saveProfile } from "../../db/queries"
import { logger } from "../../utils/helpers"
import fs from "fs"
import path from "path"

export const fulllockerCommand = {
    data: new SlashCommandBuilder()
        .setName("giveelitedonator")
        .setDescription("Give elite donator.")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username for elite donator.")
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

        const allAthenaPath = path.join(process.cwd(), "static", "profiles", "allathena.json")
        if (!fs.existsSync(allAthenaPath)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Server Error")
                .setDescription("Profile not found on server.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Server error" }
        }

        const allAthena = JSON.parse(fs.readFileSync(allAthenaPath, "utf-8"))
        allAthena.accountId = user.accountId
        allAthena.created = new Date().toISOString()
        allAthena.updated = new Date().toISOString()

        await saveProfile(user.accountId, "athena", allAthena)


        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("Elite Donator")
            .setDescription(`**${username}** has been given elite donator.`)
            .addFields(
                { name: "Account ID", value: `\`${user.accountId}\``, inline: true },
                { name: "Granted By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
