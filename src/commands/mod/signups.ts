import { Command } from "commander";
import { ButtonInteraction, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { getGlobal } from '../../utils/global';
import { activateSignup, closeSignups, getGameByName, openSignups, refreshSignup } from "../../utils/mafia/games";
import { getSetup } from "../../utils/setup";
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
            .description('create sign up button')
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)))
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await openSignups(name);

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
            .description('close signups')
            .argument('<game>', "name of game", fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await closeSignups(name);

        await refreshSignup(name);

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
            .description('open signups')
            .argument('<game>', "name of game", fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await openSignups(name);

        await refreshSignup(name);

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

    execute: async (interaction: ButtonInteraction) => {
        const game = JSON.parse(interaction.customId).game;

        createSignups(interaction, game);
    }
} satisfies Subinteraction;

async function createSignups(interaction: CommandInteraction | ButtonInteraction | TextCommand, name: string) {
    const global = await getGlobal();
    const game = await getGameByName(name);
    const setup = await getSetup();

    if(global == null || game == null) throw new Error("Could not find game.");
    if(typeof setup == 'string') throw new Error("Setup incomplete.");

    if(setup.primary.chat.id != (interaction.type == 'text' ? interaction.message.channelId : interaction.channelId)) throw new Error("Cannot create signups in this channel.");

    if(global.started) throw new Error("You cannot create signups while a game is underway.");
    
    const embed = new EmbedBuilder()
        .setTitle("Sign ups for " + game.name + (game.closed ? " are closed" : "") + "\nSign up by using the **/signup** command" + (game.signups.length > 1 ? ", " + game.signups.length + " players have signed up already" : (game.signups.length == 1 ? ", 1 player has signed up already" : "")) + "!")
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