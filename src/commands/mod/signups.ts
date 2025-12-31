import { Command } from "commander";
import { ButtonInteraction, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { activateSignup, closeSignups, getGameByName, openSignups, refreshSignup } from "../../utils/mafia/games";
import { Subcommand, Subinteraction } from "../../utils/subcommands";

export const SignupsCommand = {
    name: "signups",
    subcommand: true,

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
    text: () => {
        return new Command()
            .name('signups')
            .description('Creates signups for a new game. You can only have one signup button for each game, old buttons can be reactivated however.')
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)))
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await openSignups(name, interaction.instance);

        return await createSignups(interaction, name);
    }
} satisfies Subcommand;

export const CloseCommand = {
    name: "close",
    subcommand: true,

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
    text: () => {
        return new Command()
            .name('close')
            .description('Closes signups for a game.')
            .argument('<game>', "name of game", fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await closeSignups(name, interaction.instance);

        await refreshSignup(name, interaction.instance);

        if(interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply({ ephemeral: true, content: "Sign ups closed!" });   
        }
    }
} satisfies Subcommand;

export const OpenCommand = {
    name: "open",
    subcommand: true,

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
    text: () => {
        return new Command()
            .name('open')
            .description('Reopens signups for a game whose signups have been closed.')
            .argument('<game>', "name of game", fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await openSignups(name, interaction.instance);

        await refreshSignup(name, interaction.instance);

        if(interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply({ ephemeral: true, content: "Sign ups opened!" });   
        }
    }
} satisfies Subcommand;

export const ReactivateButton = {
    type: 'button',
    name: 'button-reactivate',
    subcommand: true,

    command: z.object({
        name: z.literal('reactivate'),
        game: z.string().min(1).max(100)
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        const game = JSON.parse(interaction.customId).game;

        createSignups(interaction, game);
    }
} satisfies Subinteraction;

async function createSignups(interaction: Event<CommandInteraction | ButtonInteraction | TextCommand>, name: string) {
    interaction.inInstance();

    const global = interaction.instance.global;
    const game = await getGameByName(name, interaction.instance);
    const setup = interaction.instance.setup;

    if(global == null || game == null) throw new Error("Could not find game.");
    if(typeof setup == 'string') throw new Error("Setup incomplete.");

    if(setup.primary.chat.id != (interaction.type == 'text' ? interaction.message.channelId : interaction.channelId)) throw new Error("Cannot create signups in this channel.");

    if(global.started) throw new Error("You cannot create signups while a game is underway.");
    
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

    await activateSignup({ id: message.id, name: game.name }, interaction.instance);
}