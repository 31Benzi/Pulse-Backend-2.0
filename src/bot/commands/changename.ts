import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, findUserByDiscordId, updateUser } from "../../db/queries"

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const changenameCommand = {
    data: new SlashCommandBuilder()
        .setName("changename")
        .setDescription("Change your in-game username (once per week)")
        .addStringOption(option =>
            option.setName("new")
                .setDescription("The new username you want")
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const newUsername = interaction.options.getString("new", true).trim()
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false

        if (newUsername.length < 3 || newUsername.length > 16) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Invalid Username")
                .setDescription("Username must be between 3 and 16 characters.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Invalid username" }
        }

        if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Invalid Username")
                .setDescription("Username can only contain letters, numbers, and underscores.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Invalid username" }
        }

        const user = await findUserByDiscordId(interaction.user.id)
        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Account Not Found")
                .setDescription("No account is linked to your Discord. Make sure you have a registered account.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "User not found" }
        }

        const existingUser = await findUserByUsername(newUsername)
        if (existingUser) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Username Taken")
                .setDescription(`The username **${newUsername}** is already taken.`)
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Username taken" }
        }

        if (!isAdmin) {
            const lastChange = user.lastNameChange
            if (lastChange) {
                const timeSinceChange = Date.now() - new Date(lastChange).getTime()
                if (timeSinceChange < ONE_WEEK_MS) {
                    const timeRemaining = ONE_WEEK_MS - timeSinceChange
                    const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000))
                    const hoursRemaining = Math.ceil(timeRemaining / (60 * 60 * 1000)) % 24

                    const embed = new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle("Cooldown Active")
                        .setDescription(`You can only change your name once per week.`)
                        .addFields(
                            { name: "Time Remaining", value: `${daysRemaining} day(s) and ${hoursRemaining} hour(s)`, inline: true }
                        )
                        .setTimestamp()
                    await interaction.reply({ embeds: [embed], flags: 64 })
                    return
                }
            }
        }

        const oldUsername = user.username
        await updateUser(user.accountId, {
            username: newUsername,
            lastNameChange: new Date()
        })

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("Username Changed")
            .setDescription(`Successfully changed username!`)
            .addFields(
                { name: "Old Username", value: `\`${oldUsername}\``, inline: true },
                { name: "New Username", value: `\`${newUsername}\``, inline: true }
            )
            .setTimestamp()

        if (!isAdmin) {
            embed.setFooter({ text: "You can change your name again in 7 days." })
        }

        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
