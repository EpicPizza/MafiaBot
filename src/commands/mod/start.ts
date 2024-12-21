import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByName, getGlobal, setAllignments, startGame } from "../../utils/main";
import { getUsersArray } from "../../utils/user";

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

        const game = await getGameByName(name);
        
        if(game == null) throw new Error("")

        const global = await getGlobal();

        if(global.started == true) throw new Error("Game has already started."); 

        const users = await getUsersArray(game.signups);

        const embed = new EmbedBuilder()
            .setTitle("Confirm Game Start")
            .setColor(Colors.Orange)
            .setFields([
                {
                    name: 'Players',
                    value: users.reduce((prev, user) => prev + user.nickname + "\n", ""),
                    inline: true
                },
                {
                    name: 'Extensions',
                    value: global.extensions.length == 0 ? "None enabled." : global.extensions.join("\n"),
                    inline: true
                }
            ])

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder()
                    .setLabel("Start")
                    .setStyle(ButtonStyle.Success)
                    .setCustomId(JSON.stringify({ name: "start", for: interaction.user.id, game: name })),
                new ButtonBuilder()
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Secondary)
                    .setCustomId(JSON.stringify({ name: "cancel-start", for: interaction.user.id }))
            ])

        await interaction.reply({ embeds: [embed], components: [row] });
    }
}

export const StartButton = {
    type: 'button',
    name: 'button-start',
    command: z.object({
        name: z.literal("start"),
        for: z.string().min(1).max(100),
        game: z.string().min(1).max(100)
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        if(id.for != interaction.user.id) throw new Error("This is not for you!");

        await startGame(interaction, id.game as string);

        await setAllignments();
    }
}

export const CancelButton = {
    type: 'button',
    name: 'button-cancel-start',
    command: z.object({
        name: z.literal("cancel-start"),
        for: z.string().min(1).max(100),
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        if(id.for != interaction.user.id) throw new Error("This is not for you!");

        await interaction.message.delete();
    }
}