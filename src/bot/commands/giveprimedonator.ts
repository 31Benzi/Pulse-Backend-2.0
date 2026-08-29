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

export const giveprimedonatorCommand = {
    data: new SlashCommandBuilder()
        .setName("giveprimedonator")
        .setDescription("Give Prime Donator items to a user (Admin only)")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("The username to give items to")
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

        let addedCount = 0
        for (const templateId of primeItems) {
            const itemKey = templateId.toLowerCase()
            
            if (!items[itemKey]) {
                items[itemKey] = {
                    templateId: templateId,
                    attributes: {
                        max_level_bonus: 0,
                        level: 1,
                        item_seen: false,
                        xp: 0,
                        variants: [],
                        favorite: false
                    },
                    quantity: 1
                }
                addedCount++
            }
        }

        athena.items = items
        athena.updated = new Date().toISOString()

        await saveProfile(user.accountId, "athena", athena)

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle("Prime Donator Items Given")
            .setDescription(`**${username}** has been given Prime Donator items!`)
            .addFields(
                { name: "Items Added", value: `${addedCount} new items`, inline: true },
                { name: "Total Items", value: `${primeItems.length}`, inline: true },
                { name: "Given By", value: `${interaction.user}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
