import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { fromZod } from '../utils/text';
import { getEnabledExtensions } from "../utils/extensions";
import { firebaseAdmin } from "../utils/firebase";
import { getBoard, retrieveVotes } from "../utils/mafia/fakevotes";
import { getGameByID, getGameByName } from "../utils/mafia/games";
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
                .addStringOption(option =>
                    option  
                        .setName('game')
                        .setDescription('Name of the game.')
                        .setAutocomplete(true)
                )
        },
        {
            type: 'text',
            name: 'text-votes',
            command: () => {
                return new Command()
                    .name('votes')
                    .description('View current votes or votes from a certain day.')
                    .argument("[day]", "which day to show votes form", fromZod(z.coerce.number().min(1).max(100)))
                    .option('-g, --game <name>', 'which game to show signups from', fromZod(z.string().min(1).max(100)));
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        return handleVoteList(interaction);
    }
}

async function handleVoteList(interaction: Event<ChatInputCommandInteraction | TextCommand>) {
    interaction.inInstance();

    let gameName = interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined ?? null : interaction.options.getString("game");
    
    const game = gameName != null ? await getGameByName(gameName ?? "---", interaction.instance, true) :  await getGameByID(interaction.instance.global.game ?? "---", interaction.instance) ?? null;

    const global = interaction.instance.global;
    
    if(global.started == false && game == null) {
        if(!(interaction.type == 'text')) throw new Error("Use text command!");

        const votes = await retrieveVotes(interaction.message.channelId);

        const board = await getBoard(votes, interaction.instance);

        const embed = new EmbedBuilder()
            .setTitle("Votes")
            .setColor(Colors.Gold)
            .setDescription(board);

        await interaction.reply({ embeds: [embed] });

        return;
    } else if(game == null) {
        throw new Error("Game not found!");
    }
    
    let day = interaction.type == 'text' ? (interaction.program.processedArgs.length > 0 ? interaction.program.processedArgs[0] as number | undefined : undefined) : interaction.options.getNumber("day") ?? undefined;
    
    if(day == undefined && global.started && global.game == game.id) {
        day = global.day;
    } else if(day == undefined) {
        throw new Error("Day not specified!");
    } else { 
        day = Math.round(day); 
    }

    if(global.started && global.game == game.id) {
        if(day > global.day) throw new Error("Not on day " + day + " yet!");
    } else {
        if(day > game.days) throw new Error("This game only had " + game.days + " days!");
    }

    if(day < 1) throw new Error("Must be at least day 1.");

    const custom = parseInt(process.env.HAMMER_THRESHOLD_PLAYERS ?? '-1');
    const players = custom === -1 ? global.players.length : custom;
    const half = Math.floor(players / 2);

    const db = firebaseAdmin.getFirestore();
    const docs = (await db.collection('instances').doc(interaction.instance.id).collection('games').doc(game.id).collection('days').doc(day.toString()).collection('votes').orderBy('timestamp', 'desc').limit(1).get()).docs;

    let board = "";
    if(docs.length == 1) board = (docs[0].data() as Log).board;
    if(board == "") board = "No votes recorded.";

    const embed = new EmbedBuilder()
        .setTitle("Votes » " + (global.day == day && global.game == game.id ? "Today (Day " + day + ")" : "Day " + day))
        .setColor(Colors.Gold)
        .setDescription(board);

    const extensions = await getEnabledExtensions(global);
    const extension = extensions.find(extension => extension.priority.includes("onVotes"));
    
    if(global.day == day && global.game == game.id) {
        const standard = "Hammer is at " + (half + 1) + " votes.";
        const footer = extension ? await extension.onVotes(interaction.instance, game, board) : standard;

        if(extension || global.hammer) embed.setFooter({ text: footer == "" ? standard : footer });
    }

    const row = new ActionRowBuilder<ButtonBuilder>()
        .setComponents([
            new ButtonBuilder()
                .setLabel("History")
                .setStyle(ButtonStyle.Link)
                .setURL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN as string : process.env.DOMAIN as string) + "/" + interaction.instance.id + "/" + game.id + "?tab=Votes&day=" + day)
        ])

    await interaction.reply({ embeds: [embed], components: [row] });
}