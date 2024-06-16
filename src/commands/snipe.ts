import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";

dnt.plugin(meridiem);

module.exports = {
    data: [
        {
            type: 'context',
            name: 'context-Snipe',
            command: new ContextMenuCommandBuilder()
                .setName('Snipe')
                .setType(ApplicationCommandType.Message)
        }
    ] satisfies Data[],

    execute: async function(interaction: ContextMenuCommandInteraction) {
        if(!interaction.isMessageContextMenuCommand()) throw new Error("Unable to fetch message.");

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('edits').doc(interaction.targetMessage.id);

        const doc = await ref.get();

        const data = doc.data();

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder()
                    .setEmoji('⤴️')
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://discord.com/channels/" + interaction.targetMessage.guildId + "/" + interaction.targetMessage.channelId + "/" + interaction.targetMessage.id)
            ])

        if(data == undefined) return await interaction.reply({ content: "No edits recorded.", components: [row] });

        const edits = data.edits as { content: string, timestamp: number }[];

        const embed = new EmbedBuilder()
            .setTitle("Edits")
            .setColor(Colors.Red)
            .setDescription(edits.reduce((previous, current) => {
                return previous += "[<t:" + Math.round(new Date(current.timestamp).valueOf() / 1000) + ":T>, <t:" + Math.round(new Date(current.timestamp).valueOf() / 1000) + ":d>] - " + current.content + "\n";
            }, ""));

        await interaction.reply({ embeds: [embed], components: [row] });
    }
}