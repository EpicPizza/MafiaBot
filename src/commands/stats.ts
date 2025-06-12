import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { getGameByID, getGlobal } from "../utils/main";
import { firebaseAdmin } from "../firebase";
import { getSetup } from "../utils/setup";
import { getUser, getUsers, User } from "../utils/user";
import { z } from "zod";
import { Command } from "../discord";

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
                        .setDescription('Which day to show votes from.')
                )
        },
        {
            type: 'text',
            name: 'text-stats',
            command: {
                optional: [ z.coerce.number().min(1).max(100) ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        return handleStatsList(interaction);
    }
}

async function handleStatsList(interaction: ChatInputCommandInteraction | Command) {
    const global = await getGlobal();

    if(global.started == false) throw new Error("Game has not started.");

    const game = await getGameByID(global.game != null ? global.game : "bruh");

    if(game == null) throw new Error("Game not found.");

    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");

    const day = interaction.type == 'text' ? (typeof interaction.arguments[0] == "number" ? interaction.arguments[0] as number ?? global.day : global.day) : Math.round(interaction.options.getNumber("day") ?? global.day);

    if(day > global.day) throw new Error("Not on day " + day + " yet!");
    if(day < 1) throw new Error("Must be at least day 1.");

    const users = await getUsers(game.signups);

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(day.toString()).collection('players');

    const currentPlayers = (await db.collection('day').doc(day.toString()).get()).data()?.players as string[] | undefined ?? [];

    const docs = (await ref.get()).docs;

    let list = [] as { name: string, id: string, messages: number, words: number, show: boolean, images: number, reactions: { reaction: string, timestamp: number }[] }[];

    for(let i = 0; i < docs.length; i++) {
        const data = docs[i].data();

        const user = users.get(docs[i].id);

        if(data) {
            list.push({
                name: user ? user.nickname : "<@" + docs[i].id + ">",
                id: docs[i].id,
                messages: data.messages,
                words: data.words,
                show: true,
                reactions: data.reactions ?? [],
                images: data.images ?? 0,
            });
        }
    }

    if(currentPlayers.length == 0) {
        list = list.filter(stat => game.signups.includes(stat.id));
    } else {
        list = list.filter(stat => currentPlayers.includes(stat.id));

        currentPlayers.forEach(player => {
            if(list.find(stat => stat.id == player) != undefined) return;

            const user = users.get(player);
            
            list.push({
                name: user ? user.nickname : "<@" + player + ">",
                id: player,
                messages: 0,
                words: 0,
                show: true,
                reactions: [],
                images: 0,
            });
        })
    }
    
    const id = (await db.collection('graphs').add({ stats: list, day: day, name: game.name, timestamp: interaction.type == 'text' ? interaction.message.createdAt.valueOf() : interaction.createdAt.valueOf() })).id;

    const message = (() => {
        list = list.sort((a, b) => b.messages - a.messages);

        return list.reduce((previous, current) => previous += current.name + " » " + current.messages + " message" + (current.messages== 1 ? "" : "s") + " containing " + current.words + " word" + (current.words== 1 ? "" : "s") + "\n", "");
    })();

    const embed = new EmbedBuilder()
        .setTitle("Stats » " + (global.day == day ? "Today (Day " + global.day + ")" : "Day " + day))
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