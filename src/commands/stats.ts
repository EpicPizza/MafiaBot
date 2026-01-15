import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { fromZod } from '../utils/text';
import { firebaseAdmin } from "../utils/firebase";
import { getGameByID, getGameByName } from "../utils/mafia/games";
import { getAllUsers, getUsers, getUsersArray } from "../utils/mafia/user";
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
                .addStringOption(option =>
                    option  
                        .setName('game')
                        .setDescription('Name of the game.')
                        .setAutocomplete(true)
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
                    .option('-g, --game <name>', 'which game to show signups from', fromZod(z.string().min(1).max(100)))
                    .option("-t, --total", "to calculate cumalitive stats");
            }
        },
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction>) => {
        return handleStatsList(interaction);
    }
}

async function handleStatsList(interaction: Event<ChatInputCommandInteraction | TextCommand>) {
    interaction.inInstance();

    let gameName = interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined ?? null : interaction.options.getString("game");

    console.log(gameName);

    if(interaction.instance.global.started == false && gameName == null) throw new Error("Game has not started, specify a game to view stats from that game!");

    const game = gameName != null ? await getGameByName(gameName ?? "---", interaction.instance, true) :  await getGameByID(interaction.instance.global.game ?? "---", interaction.instance);
    if(game == null) throw new Error("Game not found.");

    const users = await getUsersArray(game.signups, interaction.instance);
    
    if(interaction.type == 'text' ? interaction.program.getOptionValue('total') : (interaction.options.getBoolean('total') === true)) {
        const cumulativeStats: Map<string, { messages: number, words: number }> = new Map();

        for (let d = 1; d <= interaction.instance.global.day; d++) {
            const docs = await fetchStats(interaction.instance.id, game.id, d);

            for (const stats of docs) {
                const current = cumulativeStats.get(stats.id) ?? { messages: 0, words: 0 };

                cumulativeStats.set(stats.id, {
                    messages: current.messages + (stats.messages ?? 0),
                    words: current.words + (stats.words ?? 0)
                });
            }
        }

        const list = users.map(user => {
            const stats = cumulativeStats.get(user.id);

            return {
                name: user.nickname,
                id: user.id,
                messages: stats?.messages ?? 0,
                words: stats?.words ?? 0,
                
                //deprecated
                show: true,
            };
        });
        
        list.sort((a, b) => b.messages - a.messages);

        const message = list.reduce((previous, current) => previous += `${current.name} » ${current.messages} message${current.messages === 1 ? "" : "s"} containing ${current.words} word${current.words === 1 ? "" : "s"}\n`, "");

        const embed = new EmbedBuilder()
            .setTitle(`Total Stats » ${game.name}`)
            .setColor(Colors.Gold)
            .setDescription(message === '' ? "No Stats" : message);

        await interaction.reply({ embeds: [embed] });
        
        return;
    }

    let day = interaction.type == 'text' ? (interaction.program.processedArgs.length > 0 ? interaction.program.processedArgs[0] as number | undefined : undefined) : interaction.options.getNumber("day") ?? undefined;
    
    if(day == undefined && interaction.instance.global.started && interaction.instance.global.game == game.id) {
        day = interaction.instance.global.day;
    } else if(day == undefined) {
        throw new Error("Day not specified!");
    } else { 
        day = Math.round(day); 
    }

    if(interaction.instance.global.started && interaction.instance.global.game == game.id) {
        if(day > interaction.instance.global.day) throw new Error("Not on day " + day + " yet!");
    } else {
        if(day > game.days) throw new Error("This game only had " + game.days + " days!");
    }

    if(day < 1) throw new Error("Must be at least day 1.");

    const db = firebaseAdmin.getFirestore();
    const currentPlayers = (await db.collection('instances').doc(interaction.instance.id).collection('games').doc(game.id).collection('days').doc(day.toString()).get()).data()?.players as string[] | undefined ?? [];
    
    const docs = await fetchStats(interaction.instance.id, game.id, day);

    const list = currentPlayers.map(player => users.find(user => user.id == player)).filter(user => user != undefined).map(user => {
        const stats = docs.find(stat => stat.id == user.id);

        return {
            name: user.nickname,
            id: user.id,
            messages: stats?.messages ?? 0,
            words: stats?.words ?? 0,
            
            //deprecated
            show: true,
        };
    });
    
    const id = (await db.collection('graphs').add({ stats: list, day: day, name: game.name, timestamp: interaction.type == 'text' ? interaction.message.createdAt.valueOf() : interaction.createdAt.valueOf() })).id;

    list.sort((a, b) => b.messages - a.messages);

    const message =  list.reduce((previous, current) => previous += current.name + " » " + current.messages + " message" + (current.messages== 1 ? "" : "s") + " containing " + current.words + " word" + (current.words== 1 ? "" : "s") + "\n", "");

    const embed = new EmbedBuilder()
        .setTitle((((interaction.type == 'text') ? interaction.name == "reactions" : interaction.commandName == "reactions") ? "Reaction " : "") + "Stats » " + (interaction.instance.global.day == day ? "Today (Day " + interaction.instance.global.day + ")" : "Day " + day))
        .setColor(Colors.Gold)
        .setDescription(message == '' ? "No Stats" : message)

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents([
            new ButtonBuilder()
                .setLabel("More")
                .setStyle(ButtonStyle.Link)
                .setURL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN as string : process.env.DOMAIN as string) + "/" + interaction.instance.id + "/" + game.id + "?tab=Stats&pit=" + id)
        ])

    await interaction.reply({ embeds: [embed], components: [row] });
}