import { Command } from "commander";
import { ButtonInteraction, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { Subcommand, Subinteraction } from "../../utils/subcommands";
import { channelOf, getRunningGame, getRunningGames } from "../../utils/mafia/context";
import { activateVoteBoard } from "../../utils/mafia/voteBoard";

export const BoardCommand = {
    name: "board",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("board")
        .setDescription("Posts a live vote board that updates as votes come in.")
        .addStringOption(option =>
            option
                .setName('game')
                .setDescription('Game to show. Defaults to the running game.')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('board')
            .description('Posts a live vote board that updates as votes come in. Each game has one board; posting a new one deactivates the old one.')
            .option('-g, --game <name>', 'game to show, defaults to the running game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined ?? null : interaction.options.getString('game');

        const ctx = await getRunningGame(interaction.instance, channelOf(interaction), false, name); // not getCommandGame: the board shows its game, no "Game:" label

        const message = await interaction.reply({
            embeds: [loading(ctx.game.name)],
            fetchReply: true,
        });

        if(message == undefined) return;

        await activateVoteBoard(ctx, message);
    }
} satisfies Subcommand;

export const ReactivateBoardButton = {
    type: 'button',
    name: 'button-reactivate-board',
    subcommand: true,

    command: z.object({
        name: z.literal('reactivate-board'),
        game: z.string().min(1).max(100)
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();

        const id = JSON.parse(interaction.customId).game as string;

        const ctx = (await getRunningGames(interaction.instance)).find(game => game.game.id == id);

        if(ctx == undefined) throw new Error("This game is no longer running.");

        const message = await interaction.update({
            embeds: [loading(ctx.game.name)],
            components: [],
            fetchReply: true,
        });

        await activateVoteBoard(ctx, message);
    }
} satisfies Subinteraction;

function loading(name: string) {
    return new EmbedBuilder()
        .setTitle("Live Votes » " + name)
        .setColor(Colors.Gold)
        .setDescription("Loading votes...");
}
