import { Client, GatewayIntentBits, REST, Routes, Collection, ActivityType, EmbedBuilder, TextChannel } from "discord.js"
import { logger } from "../utils/helpers"
import { getActivePlayerCount } from "../utils/activePlayers"
import { banCommand } from "./commands/ban"
import { unbanCommand } from "./commands/unban"
import { fulllockerCommand } from "./commands/fulllocker"
import { removefulllockerCommand } from "./commands/removefulllocker"
import { lookupCommand } from "./commands/lookup"
import { claimprimedonatorCommand } from "./commands/claimprimedonator"
import { claimfulllockerCommand } from "./commands/claimfulllocker"
import { claimpremiumdonatorCommand } from "./commands/claimpremiumdonator"
import { removeprimedonatorCommand } from "./commands/removeprimedonator"
import { removepremiumdonatorCommand } from "./commands/removepremiumdonator"
import { giveprimedonatorCommand } from "./commands/giveprimedonator"
import { givepremiumdonatorCommand } from "./commands/givepremiumdonator"
import { ipbanCommand } from "./commands/ipban"
import { ipbanipCommand } from "./commands/ipbanip"
import { ipunbanCommand } from "./commands/ipunban"
import { arcbanCommand } from "./commands/arcban"
import { givevbucksCommand } from "./commands/givevbucks"
import { removevbucksCommand } from "./commands/removevbucks"
import { giveitemCommand } from "./commands/giveitem"
import { reportCommand } from "./commands/report"
import { changenameCommand } from "./commands/changename"
import { deleteaccountCommand } from "./commands/deleteaccount"
import { rotateshopCommand } from "./commands/rotateshop"
import { createhostCommand } from "./commands/createhost"
import { detailsCommand } from "./commands/details"
import { resethypeCommand } from "./commands/resethype"

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || ""
const LOG_CHANNEL_ID = "1477793523733364736"

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
})

async function logCommandResult(interaction: any, success: boolean, errorMessage?: string) {
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID) as TextChannel
        if (!channel) return

        const options = interaction.options.data.map((opt: any) => `${opt.name}: ${opt.value}`).join(", ")
        const fullCommand = options ? `/${interaction.commandName} ${options}` : `/${interaction.commandName}`

        const embed = new EmbedBuilder()
            .setColor(success ? 0x57F287 : 0xED4245)
            .setTitle(success ? "Command Successful" : "Command Failed")
            .addFields(
                { name: "User", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                { name: "Command", value: `\`${fullCommand}\`` }
            )
            .setTimestamp()

        if (!success && errorMessage) {
            embed.addFields({ name: "Reason", value: errorMessage })
        }

        await channel.send({ embeds: [embed] })
    } catch (error) {
        logger.error(`Discord: Failed to log command result: ${error}`)
    }
}

const commands = [
    banCommand,
    unbanCommand,
    fulllockerCommand,
    removefulllockerCommand,
    lookupCommand,
    claimprimedonatorCommand,
    claimfulllockerCommand,
    claimpremiumdonatorCommand,
    removeprimedonatorCommand,
    removepremiumdonatorCommand,
    giveprimedonatorCommand,
    givepremiumdonatorCommand,
    ipbanCommand,
    ipbanipCommand,
    ipunbanCommand,
    arcbanCommand,
    givevbucksCommand,
    removevbucksCommand,
    giveitemCommand,
    reportCommand,
    changenameCommand,
    deleteaccountCommand,
    rotateshopCommand,
    createhostCommand,
    detailsCommand,
    resethypeCommand
]

async function syncCommands() {
    if (!DISCORD_TOKEN) {
        return false
    }

    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN)

    try {
        logger.info("Discord: Syncing slash commands...")

        const clientId = client.user?.id || ""
        if (!clientId) {
            return false
        }

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands.map(c => c.data.toJSON()) }
        )

        logger.info("Discord: Slash commands synced successfully")
        return true
    } catch (error) {
        logger.error(`Discord: Failed to sync commands: ${error}`)
        return false
    }
}

function updateBotStatus() {
    const playerCount = getActivePlayerCount();
    if (playerCount > 0) {
        client.user?.setActivity(`${playerCount} Player${playerCount === 1 ? "" : "s"}`, { type: ActivityType.Watching });
    } else {
        client.user?.setActivity("Exlo", { type: ActivityType.Watching });
    }
}

export async function startDiscordBot() {
    if (!DISCORD_TOKEN) {
        logger.warn("Discord bot disabled: DISCORD_TOKEN not set")
        return
    }

    client.on("clientReady", async () => {
        logger.info(`Discord: Bot logged in as ${client.user?.tag}`)
        updateBotStatus();
        setInterval(updateBotStatus, 15000);
        await syncCommands()
    })

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return

        const command = commands.find(c => c.data.name === interaction.commandName)
        if (!command) return

        try {
            const result = await (command.execute(interaction) as Promise<{ success: false; reason?: string } | void>)
            if (result && result.success === false) {
                await logCommandResult(interaction, false, result.reason)
            } else {
                await logCommandResult(interaction, true)
            }
        } catch (error) {
            logger.error(`Discord: Command error: ${error}`)
            await logCommandResult(interaction, false, String(error))
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "An error occurred while executing the command.", ephemeral: true })
            } else {
                await interaction.reply({ content: "An error occurred while executing the command.", ephemeral: true })
            }
        }
    })

    try {
        await client.login(DISCORD_TOKEN)
    } catch (error) {
        logger.error(`Discord: Failed to login: ${error}`)
    }
}

export function getDiscordClient() {
    return client
}
