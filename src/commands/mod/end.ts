import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { endGame, setAllignments, startGame } from "../../utils/main";

export const EndCommand = {
    name: "end",
    description: "?mod end",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("end")
            .setDescription("Ends the mafia game."),
        text: {

        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        await endGame(interaction);
    }
}