import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { firebaseAdmin } from "../utils/firebase";
import { getSetup } from "../utils/setup";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-games',
            command: new SlashCommandBuilder()
                .setName("games")
                .setDescription("See all games.")
        },
        {
            type: 'text',
            name: 'text-games',
            command: () => {
                return new Command()
                    .name('games')
                    .description('See all games currently happening.')
            }
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | TextCommand) => {
        const setup = await getSetup();

        if(typeof setup == 'string') throw new Error("Setup Incomplete");
        
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('game').collection('games');

        const docs = (await ref.get()).docs;

        const games = [] as { name: string, id: string, url: string | null }[];

        for(let doc = 0; doc < docs.length; doc++) {
            const data = docs[doc].data();

            if(!data) continue;

            if(data.message == null) {
                games.push({
                    name: data.name,
                    id: docs[doc].id,
                    url: null
                })
            } else {
                games.push({
                    name: data.name,
                    id: docs[doc].id,
                    url: "https://discord.com/channels/" + setup.primary.guild.id + "/" + setup.primary.chat.id + "/" + data.message.id
                })
            }
        };
        
        const embed = new EmbedBuilder()
            .setTitle("Games")
            .setDescription("Welcome to Mafia! Click a mafia game to go to its signups.")
            .setColor(Colors.Orange)
            

        const rows = [] as ActionRowBuilder<ButtonBuilder>[]

        for(let i = 0; i < games.length; i = i + 5) {
            const row = new ActionRowBuilder<ButtonBuilder>();
    
            row.addComponents(games.filter((game, index) => index >= i && index <= i + 4).map(game => {
                if(game.url == null) {
                    return new ButtonBuilder()
                        .setLabel(game.name)
                        .setCustomId(JSON.stringify({ name: "blank", game: game.id }))
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                } else {
                    return new ButtonBuilder()
                        .setLabel(game.name)
                        .setURL(game.url)
                        .setStyle(ButtonStyle.Link)
                }
            }));
    
            rows.push(row);
        }

        if(rows.length == 0) {
            const row = new ActionRowBuilder<ButtonBuilder>();

            row.addComponents([
                new ButtonBuilder()
                    .setLabel("No Games")
                    .setCustomId(JSON.stringify({ name: "never "}))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            ]);

            rows.push(row);
        } 

        await interaction.reply({ embeds: [embed], components: rows });
    }
}