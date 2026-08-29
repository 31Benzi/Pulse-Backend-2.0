import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByUsername, updateUser } from "../../db/queries"
import { logger } from "../../utils/helpers"

export const unbanCommand = {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user from the backend")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to unban")
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

        if (!user.banned) {
            const embed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle("Not Banned")
                .setDescription(`**${username}** is not currently banned.`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return
        }

        await updateUser(user.accountId, { banned: false })
        logger.info(`Discord: User "${username}" has been unbanned by ${interaction.user.tag}`)

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("User Unbanned")
            .setDescription(`**${username}** has been unbanned from the backend.`)
            .addFields(
                { name: "Account ID", value: `\`${user.accountId}\``, inline: true },
                { name: "Unbanned By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
