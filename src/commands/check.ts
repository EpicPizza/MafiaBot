import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";
import { Command } from "../utils/commands";
import { z } from "zod";
import { getSetup } from "../utils/setup";

dnt.plugin(meridiem);

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-check',
            command: {}
        }
    ] satisfies Data[],

    execute: async function(interaction: Command) {
        const setup = await getSetup();

        if(typeof setup == 'string') return await interaction.message.react("⚠️");
        if(interaction.message.channel.type != ChannelType.GuildText ) return await interaction.message.react("⚠️");
        if(!(setup.secondary.dms.id == interaction.message.channel.parentId || setup.secondary.archivedDms.id == interaction.message.channel.parentId)) return await interaction.message.react("⚠️");

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('users').where('channel', '==', interaction.message.channelId);

        const docs = (await ref.get()).docs;

        const embed = new EmbedBuilder()
            .setTitle("Matched Users")
            .setColor('Orange')
            .setDescription(docs.length == 0 ? "No users matched." : docs.reduce((prev, current) => { return prev + "<@" + current.id + ">\n" }, ""))

        interaction.message.reply({ embeds: [embed] });
    }
}