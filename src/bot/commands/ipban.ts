import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, banIp, updateUser } from "../../db/queries"

export const ipbanCommand = {
    data: new SlashCommandBuilder()
        .setName("ipban")
        .setDescription("IP ban a user by their username")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to IP ban")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the IP ban")
                .setRequired(false)
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
        const reason = interaction.options.getString("reason") || "No reason provided"

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

        if (!user.lastIp) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("No IP Found")
                .setDescription(`User **${username}** has no recorded IP address.`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "No IP found" }
        }

        await banIp(user.lastIp, reason, interaction.user.tag)
        await updateUser(user.accountId, { banned: true })

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("User IP Banned")
            .setDescription(`**${username}** has been IP banned.`)
            .addFields(
                { name: "IP Address", value: `||${user.lastIp}||`, inline: true },
                { name: "Reason", value: reason, inline: true },
                { name: "Banned By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
