import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { fromZod } from '../utils/text';
import { getEnabledExtensions } from "../utils/extensions";
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { getBoard, retrieveVotes } from "../utils/mafia/fakevotes";
import { getGameByID } from "../utils/mafia/games";
import { Log } from "../utils/mafia/vote";
import { getSetup } from "../utils/setup";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-votes',
            command: new SlashCommandBuilder()
                .setName("votes")
                .setDescription("Show votes.")
                .addNumberOption(option =>
                    option
                        .setName('day')
                        .setDescription('game day to show votes from.')
                )
        },
        {
            type: 'text',
            name: 'text-votes',
            command: () => {
                return new Command()
                    .name('votes')
                    .description('View current votes or votes from a certain day.')
                    .argument("[day]", "which day to show votes form", fromZod(z.coerce.number().min(1).max(100)));
            }
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        return handleVoteList(interaction);
    }
}

async function handleVoteList(interaction: ChatInputCommandInteraction | TextCommand) {
    const global = await getGlobal();
    
    if(global.started == false) {
        if(!(interaction.type == 'text')) throw new Error("Use text command!");

        const votes = await retrieveVotes(interaction.message.channelId);

        const board = await getBoard(votes);

        const embed = new EmbedBuilder()
            .setTitle("Votes")
            .setColor(Colors.Gold)
            .setDescription(board);

        await interaction.reply({ embeds: [embed] });

        return;
    }


    const game = await getGameByID(global.game != null ? global.game : "bruh");
    if(game == null) throw new Error("Game not found.");
    const setup = await getSetup();
    
    const day = interaction.type == 'text' ? interaction.program.processedArgs[0] as number ?? global.day : Math.round(interaction.options.getNumber("day") ?? global.day);
    if(day > global.day) throw new Error("Not on day " + day + " yet!");
    if(day < 1) throw new Error("Must be at least day 1.");

    const custom = parseInt(process.env.HAMMER_THRESHOLD_PLAYERS ?? '-1');
    const players = custom === -1 ? global.players.length : custom;
    const half = Math.floor(players / 2);

    const db = firebaseAdmin.getFirestore();
    const docs = (await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('day').doc(day.toString()).collection('votes').orderBy('timestamp', 'desc').limit(1).get()).docs;

    let board = "";
    if(docs.length == 1) board = (docs[0].data() as Log).board;
    if(board == "") board = "No votes recorded.";

    const embed = new EmbedBuilder()
        .setTitle("Votes » " + (global.day == day ? "Today (Day " + day + ")" : "Day " + day))
        .setColor(Colors.Gold)
        .setDescription(board);

    const extensions = await getEnabledExtensions(global);
    const extension = extensions.find(extension => extension.priority.includes("onVotes"));
    
    if(global.day == day) {
        const standard = "Hammer is at " + (half + 1) + " votes.";
        const footer = extension ? await extension.onVotes(global, setup, game, board) : standard;

        if(extension || global.hammer) embed.setFooter({ text: footer == "" ? standard : footer });
    }

    const row = new ActionRowBuilder<ButtonBuilder>()
        .setComponents([
            new ButtonBuilder()
                .setLabel("History")
                .setStyle(ButtonStyle.Link)
                .setURL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN as string : process.env.DOMAIN as string) + "/game/" + global.game + "/day/" + day + "/votes")
        ])

    await interaction.reply({ embeds: [embed], components: [row] });
}