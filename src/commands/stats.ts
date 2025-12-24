import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { fromZod } from '../utils/text';
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { getGameByID } from "../utils/mafia/games";
import { getAllUsers } from "../utils/mafia/user";
import { getSetup } from "../utils/setup";
import { fetchStats } from "../utils/mafia/tracking";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-stats',
            command: new SlashCommandBuilder()
                .setName("stats")
                .setDescription("Show stats.")
                .addNumberOption(option =>
                    option
                        .setName('day')
                        .setDescription('Which day to show stats from.')
                )
                .addBooleanOption(option =>
                    option
                        .setName('total')
                        .setDescription('To calculate cumulative stats.')
                )
        },
        {
            type: 'text',
            name: 'text-stats',
            command: () => {
                return new Command()
                    .name('stats')
                    .description('View message and word count for each player.')
                    .argument("[day]", "which day to show stats form", fromZod(z.coerce.number().min(1).max(100)))
                    .option("-t, --total", "to calculate cumalitive stats");
            }
        },
        /*{ 
            type: 'slash',
            name: 'slash-reactions',
            command: new SlashCommandBuilder()
                .setName("reactions")
                .setDescription("View reaction and message count for each player.")
                .addNumberOption(option =>
                    option
                        .setName('day')
                        .setDescription('Which day to show reaction stats from.')
                )
        },
        {
            type: 'text',
            name: 'text-reactions',
            command: () => {
                return new Command()
                    .name('reactions')
                    .description('show reactions')
                    .argument("[day]", "which day to show reactions form", fromZod(z.coerce.number().min(1).max(100)))
            }
        }*/
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        return handleStatsList(interaction);
    }
}

async function handleStatsList(interaction: ChatInputCommandInteraction | TextCommand) {
    const global = await getGlobal();
    if(global.started == false) throw new Error("Game has not started.");
    const game = await getGameByID(global.game != null ? global.game : "bruh");
    if(game == null) throw new Error("Game not found.");
    
    if(interaction.type == 'text' ? interaction.program.getOptionValue('total') : (interaction.options.getBoolean('total') === true)) {
        const users = await getAllUsers();
        const db = firebaseAdmin.getFirestore();

        const cumulativeStats: Map<string, { messages: number, words: number }> = new Map();

        for (let d = 1; d <= global.day; d++) {
            const docs = await fetchStats(process.env.INSTANCE ?? "---", game.id, d);

            for (const stats of docs) {
                const current = cumulativeStats.get(stats.id) ?? { messages: 0, words: 0 };

                cumulativeStats.set(stats.id, {
                    messages: current.messages + (stats.messages ?? 0),
                    words: current.words + (stats.words ?? 0)
                });
            }
        }

        let list = Array.from(cumulativeStats.entries()).map(([id, stats]) => {
            const user = users.find(user => user.id == id);
            return {
                name: user ? user.nickname : `<@${id}>`,
                id: id,
                messages: stats.messages,
                words: stats.words,
                show: true,
                alive: false, // will be set later
                reactions: [],
                images: 0,
            };
        });

        const currentPlayersData = (await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('day').doc(global.day.toString()).get()).data();
        const currentPlayers = currentPlayersData?.players as string[] | undefined ?? game.signups;

        currentPlayers.forEach(playerId => {
            if (!list.some(p => p.id === playerId)) {
                const user = users.find(user => user.id == playerId);
                list.push({
                    name: user ? user.nickname : `<@${playerId}>`,
                    id: playerId,
                    messages: 0,
                    words: 0,
                    show: true,
                    alive: true,
                    reactions: [],
                    images: 0,
                });
            }
        });

        const aliveList = list.filter(p => currentPlayers.includes(p.id));
        aliveList.forEach(p => p.alive = true);
        
        aliveList.sort((a, b) => b.messages - a.messages);

        const message = aliveList.reduce((previous, current) => previous += `${current.name} » ${current.messages} message${current.messages === 1 ? "" : "s"} containing ${current.words} word${current.words === 1 ? "" : "s"}\n`, "");

        const embed = new EmbedBuilder()
            .setTitle(`Total Stats » ${game.name}`)
            .setColor(Colors.Gold)
            .setDescription(message === '' ? "No Stats" : message);

        await interaction.reply({ embeds: [embed] });
        
        return;
    }

    const setup = await getSetup();

    const day = interaction.type == 'text' ? (interaction.program.processedArgs.length > 0 ? interaction.program.processedArgs[0] as number | undefined ?? global.day : global.day) : Math.round(interaction.options.getNumber("day") ?? global.day);

    if(day > global.day) throw new Error("Not on day " + day + " yet!");
    if(day < 1) throw new Error("Must be at least day 1.");

    const users = await getAllUsers();

    const db = firebaseAdmin.getFirestore();
    const currentPlayers = (await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('day').doc(day.toString()).get()).data()?.players as string[] | undefined ?? [];
    
    const docs = await fetchStats(process.env.INSTANCE ?? "---", game.id, day);

    let list = [] as { name: string, id: string, messages: number, words: number, show: boolean, alive: boolean, images: number, /* reactions: { reaction: string, timestamp: number, message: string }[] */}[];
    let aliveList = [] as { name: string, id: string, messages: number, words: number, show: boolean, alive: boolean, images: number, /* reactions: { reaction: string, timestamp: number, message: string }[] */ }[];
    
    for(let i = 0; i < docs.length; i++) {
        const data = docs[i];

        const user = users.find(user => user.id == docs[i].id);

        if(data) {
            list.push({
                name: user ? user.nickname : "<@" + docs[i].id + ">",
                id: docs[i].id,
                messages: data.messages,
                words: data.words,
                show: true,
                alive: false,
//                reactions: data.reactions ?? [],
                images: data.images ?? 0,
            });
        }
    }

    if(currentPlayers.length == 0) {
        aliveList = list.filter(stat => game.signups.includes(stat.id));
    } else {
        currentPlayers.forEach(player => {
            if(list.find(stat => stat.id == player) != undefined) return;

            const user = users.find(user => user.id == player);
            
            list.push({
                name: user ? user.nickname : "<@" + player + ">",
                id: player,
                messages: 0,
                words: 0,
                show: true,
                alive: true,
//                reactions: [],
                images: 0,
            });
        })

        aliveList = list.filter(stat => currentPlayers.includes(stat.id));
    }
    aliveList.forEach(stat => stat.alive = true);
    
    const id = (await db.collection('graphs').add({ stats: list, day: day, name: game.name, timestamp: interaction.type == 'text' ? interaction.message.createdAt.valueOf() : interaction.createdAt.valueOf() })).id;

    const message = (() => {
        if((interaction.type == 'text') ? interaction.name == "stats" : interaction.commandName == "stats") {
            aliveList = aliveList.sort((a, b) => b.messages - a.messages);
            return aliveList.reduce((previous, current) => previous += current.name + " » " + current.messages + " message" + (current.messages== 1 ? "" : "s") + " containing " + current.words + " word" + (current.words== 1 ? "" : "s") + "\n", "");
        /*} else if((interaction.type == 'text') ? interaction.name == "reactions" : interaction.commandName == "reactions") {
            list = list.sort((a, b) => b.reactions.length - a.reactions.length);
            const messageCounter = (current) => (new Set(current.reactions.map(reaction => reaction.message).filter(message => message != undefined))).size;
            return list.reduce((previous, current) => previous += current.name + " » " + current.reactions.length + " reaction" + (current.reactions.length== 1 ? "" : "s") + " across " + messageCounter(current) + " message" + (messageCounter(current)== 1 ? "" : "s") + "\n", "");*/
        } else {
            return "";
        }
    })();

    const embed = new EmbedBuilder()
        .setTitle((((interaction.type == 'text') ? interaction.name == "reactions" : interaction.commandName == "reactions") ? "Reaction " : "") + "Stats » " + (global.day == day ? "Today (Day " + global.day + ")" : "Day " + day))
        .setColor(Colors.Gold)
        .setDescription(message == '' ? "No Stats" : message)

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents([
            new ButtonBuilder()
                .setLabel("More")
                .setStyle(ButtonStyle.Link)
                .setURL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN as string : process.env.DOMAIN as string) + "/stats/" + id)
        ])

    await interaction.reply({ embeds: [embed], components: [row] });
}