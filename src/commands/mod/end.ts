import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { getCommandGame } from "../../utils/mafia/context";
import { getGameByID } from "../../utils/mafia/games";
import { endGame } from "../../utils/mafia/main";
import { Subcommand, Subinteraction } from "../../utils/subcommands";

export const EndCommand = {
    name: "end",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("end")
        .setDescription("Ends the mafia game (asks to confirm).")
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
            .description('Ends the game (asks to confirm). Gives spectator perms to everyone, and invites to mafia server if they are not already in mafia server.')
            .option('-g, --game <name>', 'game to end, defaults to the game of this channel or the only running game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined ?? null : interaction.options.getString('game');

        // Resolve now so the prompt names the game that will end.
        const { game, state } = await getCommandGame(interaction, name);

        const embed = new EmbedBuilder()
            .setTitle("End " + game.name + "?")
            .setColor(Colors.Red)
            .setDescription("This ends the game on day " + state.day + " for all " + game.signups.length + " players: the main chat reopens, dead chat dms are archived and everyone becomes a spectator. This can't be undone.");

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "end-game", game: game.id }))
                    .setStyle(ButtonStyle.Danger)
                    .setLabel("End " + game.name),
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "end-cancel" }))
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel("Cancel"),
            );

        if(interaction.type == 'text') {
            await interaction.reply({ embeds: [embed], components: [row] });
        } else {
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
    }
} satisfies Subcommand;

export const EndConfirmButton = {
    type: 'button',
    name: 'button-end-game',
    subcommand: true,

    command: z.object({
        name: z.literal('end-game'),
        game: z.string().min(1).max(100),
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();

        const id = JSON.parse(interaction.customId).game as string;
        const game = await getGameByID(id, interaction.instance);

        // Swap the prompt for progress; endGame then edits this same message with the result.
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle("Ending " + game.name + "...").setColor(Colors.Red)],
            components: [],
        });

        await endGame(interaction, interaction.instance, game.name);
    }
} satisfies Subinteraction;

export const EndCancelButton = {
    type: 'button',
    name: 'button-end-cancel',
    subcommand: true,

    command: z.object({
        name: z.literal('end-cancel'),
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        await interaction.update({ content: "Cancelled, the game was not ended.", embeds: [], components: [] });
    }
} satisfies Subinteraction;
