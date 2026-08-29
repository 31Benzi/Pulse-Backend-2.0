import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, TextChannel } from "discord.js"
import { findUserByUsername } from "../../db/queries"

const REPORTS_CHANNEL_ID = "1478143221128495225"

export const reportCommand = {
    data: new SlashCommandBuilder()
        .setName("report-player")
        .setDescription("Report a player for rule violations")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The in-game username of the player you're reporting")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("The reason for the report")
                .setRequired(true)
                .addChoices(
                    { name: "Cheating/Hacking", value: "Cheating/Hacking" },
                    { name: "Exploiting", value: "Exploiting" },
                    { name: "Teaming", value: "Teaming" },
                    { name: "Toxicity/Harassment", value: "Toxicity/Harassment" },
                    { name: "Inappropriate Username", value: "Inappropriate Username" },
                    { name: "Other", value: "Other" }
                )
        )
        .addStringOption(option =>
            option.setName("details")
                .setDescription("Additional details about the report (optional)")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const reportedUsername = interaction.options.getString("username", true)
        const reason = interaction.options.getString("reason", true)
        const details = interaction.options.getString("details") || "No additional details provided"

        const reportedUser = await findUserByUsername(reportedUsername)
        const userExists = reportedUser !== null

        const reportsChannel = await interaction.client.channels.fetch(REPORTS_CHANNEL_ID).catch(() => null) as TextChannel | null

        if (!reportsChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Error")
                .setDescription("Could not find the reports channel. Please contact an administrator.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Reports channel not found" }
        }

        const reportEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("New Player Report")
            .addFields(
                { name: "Reported Player", value: `\`${reportedUsername}\``, inline: true },
                { name: "Reason", value: reason, inline: true },
                { name: "Details", value: details, inline: false },
                { name: "Reported By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
            )
            .setTimestamp()

        if (reportedUser) {
            reportEmbed.addFields(
                { name: "Account ID", value: reportedUser.accountId, inline: true },
                { name: "Last IP", value: reportedUser.lastIp || "Unknown", inline: true }
            )
        }

        await reportsChannel.send({ content: "@everyone", embeds: [reportEmbed] })

        const confirmEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("Report Submitted")
            .setDescription(`Your report against **${reportedUsername}** has been submitted and will be reviewed by our staff.`)
            .addFields(
                { name: "Reason", value: reason, inline: true }
            )
            .setFooter({ text: "Thank you for helping keep our community safe!" })
            .setTimestamp()

        await interaction.reply({ embeds: [confirmEmbed], flags: 64 })
    }
}
