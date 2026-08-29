import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByDiscordId } from "../../db/queries"

export const detailsCommand = {
    data: new SlashCommandBuilder()
        .setName("details")
        .setDescription("Get your Exlo account email and password"),

    async execute(interaction: ChatInputCommandInteraction) {
        const discordId = interaction.user.id;

        const user = await findUserByDiscordId(discordId)
        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Account Not Found")
                .setDescription("You don't have an Exlo account linked to this Discord account.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "User not found" }
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("Your Account Details")
            .setDescription(`Here are the login details for your Exlo account (**${user.username}**). Keep this information secure!`)
            .addFields(
                { name: "Email", value: `||${user.email}||`, inline: false },
                { name: "Password", value: `||${user.password}||`, inline: false }
            )
            .setTimestamp()
            
        await interaction.reply({ embeds: [embed], flags: 64 })
        return { success: true }
    }
}
