import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { findUserByDiscordId, saveProfile } from "../../db/queries"
import fs from "fs"
import path from "path"

const roleId = "1459609162366455923"

const premiumItems = [
    "AthenaCharacter:CID_Sparkx_A",
    "AthenaCharacter:Character_AuroraDart_A",
    "AthenaCharacter:Character_BandageNinjaBlue_A",
    "AthenaCharacter:Character_BarbequeLarry_A",
    "AthenaCharacter:Character_Bendy_A",
    "AthenaCharacter:Character_BerryTartRiver_A",
    "AthenaCharacter:Character_BlackMonday_A",
    "AthenaCharacter:Character_CactusRocker_A",
    "AthenaCharacter:Character_Canary_A",
    "AthenaCharacter:Character_CanineCronutMix",
    "AthenaCharacter:Character_CanineCronutMix_A",
    "AthenaCharacter:Character_Chaos_A",
    "AthenaCharacter:Character_ChimeCurlCorn_A",
    "AthenaCharacter:Character_ClayPlug_A",
    "AthenaCharacter:Character_CraftGlue_A",
    "AthenaCharacter:Character_Cyclone_A",
    "AthenaCharacter:Character_DimeBlanketKnot_A",
    "AthenaCharacter:Character_Division_A",
    "AthenaCharacter:Character_DoubleDutyDart_A",
    "AthenaCharacter:Character_DriedSilk_A",
    "AthenaCharacter:Character_DyedDuelist_A",
    "AthenaCharacter:Character_EmeraldGlassGreen_A",
    "AthenaCharacter:Character_Eternity_A",
    "AthenaCharacter:Character_EvokeFind_A",
    "AthenaCharacter:Character_FallValleyCharge_A",
    "AthenaCharacter:Character_FearlessFlightHero_A",
    "AthenaCharacter:Character_FloraBrisk_A",
    "AthenaCharacter:Character_Foray_A",
    "AthenaCharacter:Character_Glitchtrap_A",
    "AthenaCharacter:Character_GnatGala_A",
    "AthenaCharacter:Character_GroovyReader_A",
    "AthenaCharacter:Character_HeavyRoar_A",
    "AthenaCharacter:Character_Hightower_Henchman_A",
    "AthenaCharacter:Character_HightowerTomato_Casual_A",
    "AthenaCharacter:Character_HonorBraceJoust_A",
    "AthenaCharacter:Character_JadeTowelGloss_A",
    "AthenaCharacter:Character_KelpLinenCalcium_A",
    "AthenaCharacter:Character_Kimiko_A",
    "AthenaCharacter:Character_LemonCartGranite_A",
    "AthenaCharacter:Character_Lilac_A",
    "AthenaCharacter:Character_LucidAzalea_A",
    "AthenaCharacter:Character_MelodyUrchin",
    "AthenaCharacter:Character_MelodyUrchin_A",
    "AthenaCharacter:Character_MicroLeaf_A",
    "AthenaCharacter:Character_OxideHoard_A",
    "AthenaCharacter:Character_PhoneCharger_A",
    "AthenaCharacter:Character_PolkaSkate_A",
    "AthenaCharacter:Character_PrairieSkip_A",
    "AthenaCharacter:Character_PrivateJet_A",
    "AthenaCharacter:Character_PureCereal_A",
    "AthenaCharacter:Character_PurpleLightningStrike_A",
    "AthenaCharacter:Character_QuicheLorraineCrisp_A",
    "AthenaCharacter:Character_QuicheLorraineLime_A",
    "AthenaCharacter:Character_RevoltCrush_A",
    "AthenaCharacter:Character_RoseDust_A",
    "AthenaCharacter:Character_ScareyBeary_A",
    "AthenaCharacter:Character_ShyTurkey_A",
    "AthenaCharacter:Character_Skeleton_A",
    "AthenaCharacter:Character_SlugRipple_A",
    "AthenaCharacter:Character_SnowMiku_A",
    "AthenaCharacter:Character_Spider_A",
    "AthenaCharacter:Character_Springtrap_A",
    "AthenaCharacter:Character_StallionAviator_A",
    "AthenaCharacter:Character_SteveHarrington_A",
    "AthenaCharacter:Character_SummitReedGrit_A",
    "AthenaCharacter:Character_SunriseCastle_A",
    "AthenaCharacter:Character_SweetLetter_A",
    "AthenaCharacter:Character_T800_A",
    "AthenaCharacter:Character_Temple_A",
    "AthenaCharacter:Character_TextileRam_A",
    "AthenaCharacter:Character_TheRefounder_A",
    "AthenaCharacter:Character_TigerRootFame_A",
    "AthenaCharacter:Character_TimberStakeClub_A",
    "AthenaCharacter:Character_TrueRevisitor_A",
    "AthenaCharacter:Character_TweakSmirk_A",
    "AthenaCharacter:Character_TweakSmirk_Surge_A",
    "AthenaCharacter:Character_UglySweaterFrozen_A",
    "AthenaCharacter:Character_Vecna_A",
    "AthenaCharacter:CID_690_Athena_Commando_F_Photographer_A",
    "AthenaCharacter:CID_693_Athena_Commando_M_BuffCat_A",
    "AthenaCharacter:CID_694_Athena_Commando_M_CatBurglar_A",
    "AthenaCharacter:CID_AuraBrigade_A",
    "AthenaCharacter:CID_BentBaton_A",
    "AthenaCharacter:CID_BraveBuild_A",
    "AthenaCharacter:CID_CatGirl",
    "AthenaCharacter:CID_CatGirl_A",
    "AthenaCharacter:CID_ChimeCurlTell_A",
    "AthenaCharacter:CID_HeadHunter_A",
    "AthenaCharacter:CID_IceRetreat_A",
    "AthenaCharacter:CID_Iso_A",
    "AthenaCharacter:CID_LiftingRays_A",
    "AthenaCharacter:CID_Mita_A",
    "AthenaCharacter:CID_PatronPoppet_A",
    "AthenaCharacter:CID_PeonyBellow_A",
    "AthenaCharacter:CID_SacredBear_A",
    "AthenaCharacter:CID_SparkleChop_A",
    "AthenaPickaxe:Pickaxe_BoneWand_A",
    "AthenaPickaxe:Pickaxe_FNCS_A",
    "AthenaPickaxe:Pickaxe_FNCSS20Male_A",
    "AthenaPickaxe:Pickaxe_HistorianMale_A",
    "AthenaPickaxe:Pickaxe_ID_599_CavernFemale_A",
    "AthenaPickaxe:Pickaxe_KeyTracker_A",
    "AthenaPickaxe:Pickaxe_Lightsaber_A",
    "AthenaPickaxe:Pickaxe_LollipopTricksterFemale_A",
    "AthenaDance:EID_2023_A",
    "AthenaDance:EID_Adoration_A",
    "AthenaDance:EID_BeatMachine_A",
    "AthenaDance:EID_BrokenSpot_A",
    "AthenaDance:EID_BuffCatComic_A",
    "AthenaDance:EID_Caffeine_A",
    "AthenaDance:EID_Caffiene_Spedup_A",
    "AthenaDance:EID_ChelseaHotel_A",
    "AthenaDance:EID_Comrade",
    "AthenaDance:EID_Coronation_A",
    "AthenaDance:EID_Devotion_A",
    "AthenaDance:EID_Dignified_A",
    "AthenaDance:EID_DownTheDrain_A",
    "AthenaDance:EID_Downward",
    "AthenaDance:EID_Dreadful",
    "AthenaDance:EID_Embrace_A",
    "AthenaDance:EID_Enrapture_A",
    "AthenaDance:EID_EssayViewMyth_A",
    "AthenaDance:EID_Exquisite_A",
    "AthenaDance:EID_Fantasy_A",
    "AthenaDance:EID_FatCats_A",
    "AthenaDance:EID_FightNight_A",
    "AthenaDance:EID_FlailingFins_A",
    "AthenaDance:EID_GalaxyGirls_A",
    "AthenaDance:EID_Gracious_A",
    "AthenaDance:EID_Helium_A",
    "AthenaDance:EID_IcedOut",
    "AthenaDance:EID_JanuaryBop_A",
    "AthenaDance:EID_JulyBooks_A",
    "AthenaDance:EID_LasagnaDance_A",
    "AthenaDance:EID_Limelight",
    "AthenaDance:EID_Memory_A",
    "AthenaDance:EID_Minecraft_A",
    "AthenaDance:EID_NeonDream_A",
    "AthenaDance:EID_NerdStomp_A",
    "AthenaDance:EID_NewHeart_A",
    "AthenaDance:EID_Oxytocin_A",
    "AthenaDance:EID_Panoramic_A",
    "AthenaDance:EID_Phantom_A",
    "AthenaDance:EID_Princess_A",
    "AthenaDance:EID_QuickRobbery_A",
    "AthenaDance:EID_RelayStick_Carmine_A",
    "AthenaDance:EID_Ringer_A",
    "AthenaDance:EID_RoyalAngst_A",
    "AthenaDance:EID_Shimmy_A",
    "AthenaDance:EID_Studs_A",
    "AthenaDance:EID_Sublime_A",
    "AthenaDance:EID_SummitReedMolt_A",
    "AthenaDance:EID_Tally_A",
    "AthenaDance:EID_TangyRadishMagma_A",
    "AthenaDance:EID_Timeless_A",
    "AthenaDance:EID_TwilightSpot_Hand_A",
    "AthenaDance:EID_TwoHype_A",
    "AthenaDance:EID_Vitality_A",
    "AthenaDance:EID_VoidRedemption_A",
    "AthenaDance:EID_WaitingRoom_A",
    "AthenaDance:EID_ZebraScramble_A",
    "AthenaDance:Emoji_Exlo",
    "AthenaMusicPack:MusicPack_999_A",
    "AthenaMusicPack:MusicPack_AL_A",
    "AthenaMusicPack:MusicPack_ATS_A",
    "AthenaMusicPack:MusicPack_BF_A",
    "AthenaMusicPack:MusicPack_BOP_A",
    "AthenaMusicPack:MusicPack_BOT_A",
    "AthenaMusicPack:MusicPack_BZRP_A",
    "AthenaMusicPack:MusicPack_C_A",
    "AthenaMusicPack:MusicPack_caliente_A",
    "AthenaMusicPack:MusicPack_ClubStep",
    "AthenaMusicPack:MusicPack_Cotto_A",
    "AthenaMusicPack:MusicPack_Despacito_A",
    "AthenaMusicPack:MusicPack_DNA",
    "AthenaMusicPack:MusicPack_ElectroA",
    "AthenaMusicPack:MusicPack_EOB_A_",
    "AthenaMusicPack:MusicPack_euphoria",
    "AthenaMusicPack:MusicPack_Fein_A",
    "AthenaMusicPack:MusicPack_FL_A",
    "AthenaMusicPack:MusicPack_Focalor_A",
    "AthenaMusicPack:MusicPack_Givenchy_A",
    "AthenaMusicPack:MusicPack_goosebumps_A",
    "AthenaMusicPack:MusicPack_Hexagonest",
    "AthenaMusicPack:MusicPack_HexagonForce",
    "AthenaMusicPack:MusicPack_HUMBLE",
    "AthenaMusicPack:MusicPack_ITISYFT_A",
    "AthenaMusicPack:MusicPack_Knock_A",
    "AthenaMusicPack:MusicPack_LMK_A",
    "AthenaMusicPack:MusicPack_LMN_A",
    "AthenaMusicPack:MusicPack_Murder_A",
    "AthenaMusicPack:MusicPack_NCLB_A",
    "AthenaMusicPack:MusicPack_nLE_A",
    "AthenaMusicPack:MusicPack_PG_A",
    "AthenaMusicPack:MusicPack_rakai_A",
    "AthenaMusicPack:MusicPack_ransom_A",
    "AthenaMusicPack:MusicPack_Sicko_A",
    "AthenaMusicPack:MusicPack_SOU_A",
    "AthenaMusicPack:MusicPack_TL_A",
    "AthenaMusicPack:MusicPack_UD_A",
    "AthenaMusicPack:MusicPack_YKWIM_A"
]

export const claimpremiumdonatorCommand = {
    data: new SlashCommandBuilder()
        .setName("claimpremiumdonator")
        .setDescription("Claim your Premium Donator rewards"),

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
                .setDescription("You do not have the **Premium Donator** role required to use this command.")
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

        const allAthenaPath = path.join(process.cwd(), "static", "profiles", "allathena.json")
        if (!fs.existsSync(allAthenaPath)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Server Error")
                .setDescription("Full locker profile not found on server.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Server error" }
        }

        const allAthena = JSON.parse(fs.readFileSync(allAthenaPath, "utf-8"))
        allAthena.accountId = user.accountId
        allAthena.created = new Date().toISOString()
        allAthena.updated = new Date().toISOString()

        const items = (allAthena.items || {}) as Record<string, unknown>

        let addedCount = 0
        for (const templateId of premiumItems) {
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

        allAthena.items = items

        await saveProfile(user.accountId, "athena", allAthena)

        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle("Premium Donator Rewards Claimed!")
            .setDescription(`**${user.username}** has received their Premium Donator rewards!`)
            .addFields(
                { name: "Items Added", value: `${addedCount} new items`, inline: true },
                { name: "Total Items", value: `${premiumItems.length}`, inline: true }
            )
            .setTimestamp()
        await interaction.reply({ embeds: [embed], flags: 64 })
    }
}
