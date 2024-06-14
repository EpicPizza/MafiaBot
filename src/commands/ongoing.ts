import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { firebaseAdmin } from "../firebase";
import { Data } from "../discord";
import { getSetup } from "../utils/setup";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-ongoing',
            command: new SlashCommandBuilder()
                .setName("ongoing")
                .setDescription("See all ongoing games.")
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        const setup = await getSetup();

        if(typeof setup == 'string') throw new Error("Setup Incomplete");
        
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('game').collection('games');

        const docs = (await ref.get()).docs;

        const games = [] as { name: string, id: string, url: string }[];

        for(let doc = 0; doc < docs.length; doc++) {
            const data = docs[doc].data();

            if(!data || data.message == null) continue;

            games.push({
                name: data.name,
                id: docs[doc].id,
                url: "https://discord.com/channels/" + setup.primary.guild.id + "/" + setup.primary.chat.id + "/" + data.message.id
            })
        };

        const embed = new EmbedBuilder()
            .setTitle("Ongoing Games")
            .setDescription("Welcome to Mafia! Click an ongoing mafia game to go to its signups.")
            .setColor(Colors.Orange)
            
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(games.map(game => {
                return new ButtonBuilder()
                    .setLabel(game.name)
                    .setURL(game.url)
                    .setStyle(ButtonStyle.Link)
            }));

        if(row.components.length == 0) {
            row.addComponents([
                new ButtonBuilder()
                    .setLabel("No Ongoing Games")
                    .setCustomId(JSON.stringify({ name: "never "}))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            ])
        } 

        await interaction.reply({ embeds: [embed], components: [row] });
    }
}