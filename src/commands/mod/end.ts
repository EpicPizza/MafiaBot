import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { endGame } from "../../utils/mafia/main";
import { Subcommand } from "../../utils/subcommands";

export const EndCommand = {
    name: "end",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("end")
        .setDescription("Ends the mafia game.")
        .addStringOption(option =>
            option
                .setName("game")
                .setDescription("Game to end. Defaults to the game of this channel, or the only running game.")
                .setRequired(false)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('end')
            .description('Ends the game. Gives spectator perms to everyone, and invites to mafia server if they are not already in mafia server.')
            .option('-g, --game <name>', 'game to end, defaults to the game of this channel or the only running game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const game = interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined ?? null : interaction.options.getString('game');

        await endGame(interaction, interaction.instance, game);
    }
} satisfies Subcommand;
