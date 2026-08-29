import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByDiscordId, findProfile, saveProfile } from "../../db/queries"
import { logger } from "../../utils/helpers"

const roleId = "1459609454617170093"

const primeItems = [
    "AthenaCharacter:CID_029_Athena_Commando_F_Halloween",
    "AthenaCharacter:CID_030_Athena_Commando_M_Halloween",
    "AthenaCharacter:CID_313_Athena_Commando_M_KpopFashion",
    "AthenaCharacter:CID_028_Athena_Commando_F",
    "AthenaCharacter:CID_039_Athena_Commando_F_Disco",
    "AthenaCharacter:CID_017_Athena_Commando_M",
    "AthenaCharacter:CID_035_Athena_Commando_M_Medieval",
    "AthenaPickaxe:Pickaxe_ID_599_CavernFemale_A",
    "AthenaPickaxe:Pickaxe_LollipopTricksterFemale_A"
]

export const claimprimedonatorCommand = {
    data: new SlashCommandBuilder()
        .setName("claimprimedonator")
        .setDescription("Claim your Prime Donator rewards"),

    async execute(interaction: ChatInputCommandInteraction) {
        const member = interaction.member
        if (!member || !("roles" in member)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Error")
                .setDescription("Could not verify your roles.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Could not verify roles" }
        }

        const hasRole = member.roles instanceof Array
            ? member.roles.includes(roleId)
            : member.roles.cache.has(roleId)

        if (!hasRole) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Access Denied")
                .setDescription("You do not have the **Prime Donator** role required to use this command.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Access denied" }
        }

        const user = await findUserByDiscordId(interaction.user.id)
        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Account Not Linked")
                .setDescription("No game account is linked to your Discord. Please log in to the game first.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Account not linked" }
        }

        const allProfiles = await findProfile(user.accountId) as Record<string, Record<string, unknown>> | undefined
        if (!allProfiles || !allProfiles.athena) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Profile Not Found")
                .setDescription("Could not find your athena profile. Please log in to the game first.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Profile not found" }
        }

        const athena = allProfiles.athena as Record<string, unknown>
        const items = (athena.items || {}) as Record<string, unknown>

        const addedItems: string[] = []
        for (const itemId of primeItems) {
            const templateId = itemId
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
                addedItems.push(templateId.split(":")[1])
            }
        }

        athena.items = items
        athena.updated = new Date().toISOString()

        await saveProfile(user.accountId, "athena", athena)

        logger.info(`Discord: User "${user.username}" claimed Prime Donator rewards (${addedItems.length} items) via ${interaction.user.tag}`)

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle("Prime Donator Rewards Claimed!")
            .setDescription(`**${user.username}** has received their Prime Donator rewards!`)
            .addFields(
                { name: "Items Received", value: addedItems.length > 0 ? addedItems.join("\n") : "You already have all items!", inline: false },
                { name: "Total Items", value: `${primeItems.length}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
