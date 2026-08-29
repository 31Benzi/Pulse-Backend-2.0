import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, deleteUser } from "../../db/queries"

export const deleteaccountCommand = {
    data: new SlashCommandBuilder()
        .setName("deleteaccount")
        .setDescription("Permanently delete a user's account (Admin only)")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username of the account to delete")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("confirm")
                .setDescription("Confirm deletion (set to true)")
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
        const confirm = interaction.options.getBoolean("confirm", true)

        if (!confirm) {
            const embed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle("Deletion Cancelled")
                .setDescription("You must set `confirm` to **True** to delete the account.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return
        }

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

        const accountId = user.accountId
        const email = user.email

        await deleteUser(accountId)

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("Account Deleted")
            .setDescription(`Successfully deleted the account for **${username}**`)
            .addFields(
                { name: "Username", value: username, inline: true },
                { name: "Email", value: email, inline: true },
                { name: "Account ID", value: accountId, inline: false },
                { name: "Deleted By", value: `${interaction.user.tag}`, inline: true }
            )
            .setFooter({ text: "This action is irreversible!" })
            .setTimestamp()

        await interaction.reply({ embeds: [embed] })
    }
}
