import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByUsername } from "../../db/queries"
import { logger } from "../../utils/helpers"
import { deactivateUrl, banAuthKey, arcClientId } from "../../controllers/arc"

export const arcbanCommand = {
    data: new SlashCommandBuilder()
        .setName("arcban")
        .setDescription("Ban a user from Arc anticheat")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to ban from Arc")
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

        await interaction.deferReply({ flags: 64 })

        try {
            const response = await fetch(`${deactivateUrl}/${user.accountId}`, {
                method: "POST",
                headers: {
                    "X-Arc-Auth": banAuthKey,
                    "X-Arc-Client": arcClientId,
                    "Content-Type": "application/json"
                }
            })

            if (!response.ok) {
                const errorText = await response.text()
                logger.error(`Discord: Arc ban failed for "${username}": ${response.status} - ${errorText}`)
                
                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("Arc Ban Failed")
                    .setDescription(`Failed to ban **${username}** from Arc.`)
                    .addFields(
                        { name: "Status", value: `${response.status}`, inline: true },
                        { name: "Error", value: errorText || "Unknown error", inline: false }
                    )
                    .setTimestamp()
                await interaction.editReply({ embeds: [embed] })
                return { success: false, reason: "Arc ban failed" }
            }

            logger.info(`Discord: User "${username}" has been banned from Arc by ${interaction.user.tag}`)

            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Arc Ban Successful")
                .setDescription(`**${username}** has been banned from Arc anticheat.`)
                .addFields(
                    { name: "Account ID", value: `\`${user.accountId}\``, inline: true },
                    { name: "Banned By", value: `${interaction.user}`, inline: true }
                )
                .setTimestamp()
            await interaction.editReply({ embeds: [embed] })
        } catch (error) {
            logger.error(`Discord: Arc ban error for "${username}": ${error}`)
            
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Arc Ban Error")
                .setDescription(`An error occurred while banning **${username}** from Arc.`)
                .addFields(
                    { name: "Error", value: `${error}`, inline: false }
                )
                .setTimestamp()
            await interaction.editReply({ embeds: [embed] })
            return { success: false, reason: "Server error" }
        }
    }
}
