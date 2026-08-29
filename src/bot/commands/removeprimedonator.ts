import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js"
import { findUserByUsername, findProfile, saveProfile } from "../../db/queries"

const primeItems = [
    "AthenaCharacter:CID_029_Athena_Commando_F_Halloween",
    "AthenaCharacter:CID_030_Athena_Commando_M_Halloween",
    "AthenaCharacter:CID_313_Athena_Commando_M_KpopFashion",
    "AthenaCharacter:CID_028_Athena_Commando_F",
    "AthenaCharacter:CID_039_Athena_Commando_F_Disco",
    "AthenaCharacter:CID_017_Athena_Commando_M",
    "AthenaCharacter:CID_035_Athena_Commando_M_Medieval",
    "Pickaxe_ID_599_CavernFemale_A",
    "Pickaxe_LollipopTricksterFemale_A"
]

export const removeprimedonatorCommand = {
    data: new SlashCommandBuilder()
        .setName("removeprimedonator")
        .setDescription("Remove Prime Donator items from a user")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to remove items from")
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

        const allProfiles = await findProfile(user.accountId) as Record<string, Record<string, unknown>> | undefined
        if (!allProfiles || !allProfiles.athena) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Profile Not Found")
                .setDescription("Could not find athena profile.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Profile not found" }
        }

        const athena = allProfiles.athena as Record<string, unknown>
        const items = (athena.items || {}) as Record<string, unknown>

        let removedCount = 0
        for (const templateId of primeItems) {
            const itemKey = templateId.toLowerCase()
            if (items[itemKey]) {
                delete items[itemKey]
                removedCount++
            }
        }

        athena.items = items
        athena.updated = new Date().toISOString()

        await saveProfile(user.accountId, "athena", athena)

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("Prime Donator Items Removed")
            .setDescription(`Removed Prime Donator items from **${username}**`)
            .addFields(
                { name: "Items Removed", value: `${removedCount}`, inline: true },
                { name: "Removed By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
