import { ButtonInteraction, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { getGameByName, getGlobal } from "../../utils/main";
import { z } from "zod";
import { activateSignup, closeSignups, openSignups, refreshSignup } from "../../utils/games";
import { getSetup } from "../../utils/setup";

export const SignupsCommand = {
    name: "signups",
    description: "?mod signups {game}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("signups")
            .setDescription("Creates sign up button for a new game.")
            .addStringOption(option =>
                option  
                    .setName('game')
                    .setDescription('Name of the game.')
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await openSignups(name);

        return await createSignups(interaction, name);
    }
}

export const CloseCommand = {
    name: "close",
    description: "?mod close {game}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("close")
            .setDescription("Close signups.")
            .addStringOption(option =>
                option  
                    .setName('game')
                    .setDescription('Name of the game.')
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await closeSignups(name);

        await refreshSignup(name);

        if(interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply({ ephemeral: true, content: "Sign ups closed!" });   
        }
    }
}

export const OpenCommand = {
    name: "open",
    description: "?mod open {game}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName('open')
            .setDescription('Open signups.')
            .addStringOption(option =>
                option  
                    .setName('game')
                    .setDescription('Name of the game.')
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await openSignups(name);

        await refreshSignup(name);

        if(interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply({ ephemeral: true, content: "Sign ups opened!" });   
        }
    }
}

export const ReactivateButton = {
    type: 'button',
    name: 'button-reactivate',
    command: z.object({
        name: z.literal('reactivate'),
        game: z.string().min(1).max(100)
    }),
    execute: async (interaction: ButtonInteraction) => {
        const game = JSON.parse(interaction.customId).game;

        createSignups(interaction, game);
    }
}

async function createSignups(interaction: CommandInteraction | ButtonInteraction | Command, name: string) {
    const global = await getGlobal();
    const game = await getGameByName(name);
    const setup = await getSetup();

    if(global == null || game == null) throw new Error("Could not find game.");
    if(typeof setup == 'string') throw new Error("Setup incomplete.");

    if(setup.primary.chat.id != (interaction.type == 'text' ? interaction.message.channelId : interaction.channelId)) throw new Error("Cannot create signups in this channel.");

    if(global.started) {
        if(interaction.type == 'text') {
            await interaction.reply({
                content: "You cannot create signups while a game is underway.",
            })
        } else {
            await interaction.reply({
                content: "You cannot create signups while a game is underway.",
                ephemeral: true,
            })
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle("Sign ups for " + game.name + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription("Loading sign ups...");

    const message = (interaction.type != 'text' && interaction.isButton() ? await interaction.update({
        embeds: [embed],
        fetchReply: true,
        components: [],
    }) : await interaction.reply({
        embeds: [embed],
        fetchReply: true,
    }));

    if(message == undefined || message.guildId == undefined) return;

    await activateSignup({ id: message.id, name: game.name });
}