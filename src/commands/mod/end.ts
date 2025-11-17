import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { type TextCommand } from '../../discord';
import { endGame } from "../../utils/mafia/main";
import { Subcommand } from "../../utils/subcommands";

export const EndCommand = {
    name: "end",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("end")
        .setDescription("Ends the mafia game."),
    text: () => {
        return new Command()
            .name('end')
            .description('Ends the game. Gives spectator perms to everyone, and invites to mafia server if they are not already in mafia server.')
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        await endGame(interaction);
    }
} satisfies Subcommand;