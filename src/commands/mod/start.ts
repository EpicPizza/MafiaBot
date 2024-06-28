import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { setAllignments, startGame } from "../../utils/main";

export const StartCommand = {
    name: "start",
    description: "?mod start {name}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("start")
            .setDescription("Starts the mafia game.")
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

        await startGame(interaction, name);

        await setAllignments();
    }
}