import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { unbanIp, getBannedIp } from "../../db/queries"

export const ipunbanCommand = {
    data: new SlashCommandBuilder()
        .setName("ipunban")
        .setDescription("Unban an IP address")
        .addStringOption(option =>
            option.setName("ip")
                .setDescription("The IP address to unban")
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

        const ip = interaction.options.getString("ip", true)

        const bannedIp = await getBannedIp(ip)
        if (!bannedIp) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("IP Not Banned")
                .setDescription(`IP **${ip}** is not banned.`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "IP not banned" }
        }

        await unbanIp(ip)

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("IP Address Unbanned")
            .setDescription(`IP **${ip}** has been unbanned.`)
            .addFields(
                { name: "Unbanned By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
