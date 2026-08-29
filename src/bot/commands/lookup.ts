import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByUsername } from "../../db/queries"

export const lookupCommand = {
    data: new SlashCommandBuilder()
        .setName("lookup")
        .setDescription("Look up a user's account information")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to look up")
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

        const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleString() : "Unknown"
        const bannedStatus = user.banned ? "Yes" : "No"

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("User Lookup")
            .setDescription(`Account information for **${username}**`)
            .addFields(
                { name: "Account ID", value: `\`${user.accountId}\``, inline: false },
                { name: "Email", value: user.email || "Not set", inline: true },
                { name: "Username", value: user.username, inline: true },
                { name: "Registered", value: createdAt, inline: true },
                { name: "Banned", value: bannedStatus, inline: true },
                { name: "Last IP", value: user.lastIp ? `||${user.lastIp}||` : "Never connected", inline: true },
                { name: "Discord", value: user.discordId ? `<@${user.discordId}>` : "Not linked", inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
