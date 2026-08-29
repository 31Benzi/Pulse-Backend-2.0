import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByDiscordId, saveProfile } from "../../db/queries"
import fs from "fs"
import path from "path"

const REQUIRED_ROLE_ID = "1459609329559666708"

export const claimfulllockerCommand = {
    data: new SlashCommandBuilder()
        .setName("claimelitedonator")
        .setDescription("Claim full locker for your account (requires special role)"),

    async execute(interaction: ChatInputCommandInteraction) {
        const member = interaction.member
        if (!member || !("roles" in member)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Error")
                .setDescription("Could not verify your roles.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Could not verify roles" }
        }

        const hasRole = member.roles instanceof Array
            ? member.roles.includes(REQUIRED_ROLE_ID)
            : member.roles.cache.has(REQUIRED_ROLE_ID)

        if (!hasRole) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Access Denied")
                .setDescription("You do not have the required role to use this command.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Access denied" }
        }

        const user = await findUserByDiscordId(interaction.user.id)
        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Account Not Linked")
                .setDescription("No game account is linked to your Discord. Please log in to the game first.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Account not linked" }
        }

        const allAthenaPath = path.join(process.cwd(), "static", "profiles", "allathena.json")
        if (!fs.existsSync(allAthenaPath)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Server Error")
                .setDescription("Full locker profile not found on server.")
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
            .setTitle("Full Locker Claimed")
            .setDescription(`**${user.username}** has claimed full locker!`)
            .addFields(
                { name: "Account ID", value: `\`${user.accountId}\``, inline: true },
                { name: "Claimed By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
