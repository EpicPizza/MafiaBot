import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { archiveGame, createGame } from "../../utils/games";
import { z } from "zod";

export const CreateCommand = {
    name: "create",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName('create')
            .setDescription("Creates a mafia game.")
            .addStringOption(option =>
                option  
                    .setName('game')
                    .setDescription('Name of the game.')
                    .setRequired(true)
            ),
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await createGame(interaction, name);
    }
}

export const ArchiveCommand = {
    name: "archive",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("archive")
            .setDescription("Archives a game.")
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

        await archiveGame(interaction, name);
    }
}