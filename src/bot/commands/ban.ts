import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByUsername, updateUser } from "../../db/queries"
import { logger } from "../../utils/helpers"

export const banCommand = {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the backend")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to ban")
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

        if (user.banned) {
            const embed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle("Already Banned")
                .setDescription(`**${username}** is already banned from the backend.`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return
        }

        await updateUser(user.accountId, { banned: true })
        logger.info(`Discord: User "${username}" has been banned by ${interaction.user.tag}`)

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("User Banned")
            .setDescription(`**${username}** has been banned.`)
            .addFields(
                { name: "Account ID", value: `\`${user.accountId}\``, inline: true },
                { name: "Banned By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
