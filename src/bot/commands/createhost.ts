import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { createUser, createProfiles } from "../../db/queries"
import { logger } from "../../utils/helpers"
import crypto from "crypto"

export const createhostCommand = {
    data: new SlashCommandBuilder()
        .setName("createhost")
        .setDescription("Create a host/server account")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("Username for the host account")
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

        const accountId = crypto.randomUUID().replace(/-/g, "")
        const matchmakingId = crypto.randomUUID().replace(/-/g, "")
        const email = `${crypto.randomBytes(8).toString("hex")}@host.exlo`
        const password = crypto.randomBytes(16).toString("hex")

        try {
            await createUser({
                accountId,
                username,
                email,
                password,
                matchmakingId,
                isServer: true,
                banned: false,
                arenaDivision: 1,
                arenaHype: 0,
                discordId: null,
            })

            await createProfiles(accountId, username)

            logger.info(`Discord: Host account "${username}" created by ${interaction.user.tag}`)

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("Host Account Created")
                .addFields(
                    { name: "Username", value: `\`${username}\``, inline: true },
                    { name: "Account ID", value: `\`${accountId}\``, inline: true },
                    { name: "Email", value: `\`${email}\``, inline: false },
                    { name: "Password", value: `\`${password}\``, inline: false },
                    { name: "Created By", value: `${interaction.user}`, inline: true }
                )
                .setTimestamp()

            await interaction.reply({ embeds: [embed], flags: 64 })
        } catch (error) {
            logger.error(`Discord: Failed to create host account: ${error}`)

            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Failed to Create Host Account")
                .setDescription(`An error occurred: \`${error}\``)
                .setTimestamp()

            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Server error" }
        }
    }
}
