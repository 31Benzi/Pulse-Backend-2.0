import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { banIp, findUsersByIp, updateUser } from "../../db/queries"

export const ipbanipCommand = {
    data: new SlashCommandBuilder()
        .setName("banip")
        .setDescription("Ban a specific IP address")
        .addStringOption(option =>
            option.setName("ip")
                .setDescription("The IP address to ban")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the IP ban")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("banusers")
                .setDescription("Also ban all users with this IP")
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

        const ip = interaction.options.getString("ip", true)
        const reason = interaction.options.getString("reason") || "No reason provided"
        const banUsers = interaction.options.getBoolean("banusers") || false

        await banIp(ip, reason, interaction.user.tag)

        let bannedUsers: string[] = []
        if (banUsers) {
            const usersWithIp = await findUsersByIp(ip)
            for (const user of usersWithIp) {
                await updateUser(user.accountId, { banned: true })
                bannedUsers.push(user.username)
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("IP Address Banned")
            .setDescription(`IP **${ip}** has been banned.`)
            .addFields(
                { name: "Reason", value: reason, inline: true },
                { name: "Banned By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()

        if (bannedUsers.length > 0) {
            embed.addFields({ name: "Users Also Banned", value: bannedUsers.join(", "), inline: false })
        }

        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
