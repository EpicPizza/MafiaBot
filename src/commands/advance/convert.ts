import { Command } from "commander";
import { ChannelType, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { removeReactions } from "../../discord/helpers";
import { fromZod } from '../../utils/text';
import { clearMainChatCache } from "../../utils/mafia/context";
import { createGameChat, gameRef, getGameByName } from "../../utils/mafia/games";
import { isGameStarted } from "../../utils/mafia/state";
import { Subcommand } from "../../utils/subcommands";

// Gives a game made before per-game main chats its own main chat and alive role, keeping its signups and everything else.
export const ConvertCommand = {
    name: "convert",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("convert")
        .setDescription("Give an older game its own main chat and alive role.")
        .addStringOption(option =>
            option
                .setName("game")
                .setDescription("Name of the game.")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addChannelOption(option =>
            option
                .setName("chat")
                .setDescription("Use an existing channel as the main chat instead of making a new one.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),
    text: () => {
        return new Command()
            .name('convert')
            .description('Give a game made before per-game main chats its own main chat and alive role. Keeps its signups. Not for games that have started.')
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)))
            .option('-c, --chat <channel>', 'existing channel to use as the main chat', fromZod(z.string().regex(/^(<#\d+>|\d+)$/, "Not a channel!")));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game', true);
        const chat = interaction.type == 'text' ? (interaction.program.getOptionValue('chat') as string | undefined)?.replace(/[<#>]/g, "") : interaction.options.getChannel('chat')?.id;

        const game = await getGameByName(name, interaction.instance);

        if(game.channels.main) throw new Error(game.name + " already has its own main chat.");
        if(await isGameStarted(interaction.instance, game.id)) throw new Error(game.name + " has already started. Convert it before starting, or let it finish on the server main chat.");

        const { main, mainCreated, alive } = await createGameChat(interaction.instance, game.name, chat);

        await gameRef(interaction.instance, game.id).update({
            'channels.main': main.id,
            'channels.mainCreated': mainCreated,
            roles: { alive: alive.id },
        });

        clearMainChatCache(interaction.instance);

        const reply = game.name + " converted. Main chat: " + main.url + ", alive role: <@&" + alive.id + ">.";

        if(interaction.type != 'text') {
            await interaction.editReply({ content: reply });
        } else {
            await removeReactions(interaction.message);

            await interaction.reply({ content: reply });
        }
    }
} satisfies Subcommand;
