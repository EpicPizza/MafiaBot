import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, SlashCommandBuilder, TextChannel, WebhookClient } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";
import { Command } from "../discord";
import { getSetup } from "../utils/setup";
import { getGlobal } from "../utils/main";
import { getUser } from "../utils/user";
import { archiveMessage } from "../archive";

dnt.plugin(meridiem);

module.exports = {
    data: [
        {
            type: 'context',
            name: 'context-Note',
            command: new ContextMenuCommandBuilder()
                .setName('Note')
                .setType(ApplicationCommandType.Message)
        },
        {
            type: 'text',
            name: 'text-note',
            command: {},
        }
    ] satisfies Data[],

    execute: async function(interaction: ContextMenuCommandInteraction | Command) {
        if(interaction.type != "text") await interaction.deferReply({ ephemeral: true });
        if(interaction.type != 'text' && !interaction.isMessageContextMenuCommand()) throw new Error("Unable to fetch message.");

        const id = interaction.type == 'text' ? interaction.message.reference?.messageId : interaction.targetMessage.id;
        if(id == undefined) throw new Error("Must refer to a message to note.");

        const setup = await getSetup();
        const global = await getGlobal();

        if(interaction.type == 'text' ? interaction.message.channelId != setup.primary.chat.id : interaction.channelId != setup.primary.chat.id) throw new Error("Not main chat!");

        const user = await getUser(interaction.user.id);
        if(user == undefined || !global.players.find(player => player.id == user.id)) throw new Error("You're not in this game!");

        const channel = setup.secondary.guild.channels.cache.get(user.channel ?? "");
        if(channel == undefined || !(channel.type == ChannelType.GuildText)) throw new Error("Channel not found.");

        if(interaction.type == 'text') await interaction.message.react("✅");

        const webhook = await channel.createWebhook({
            name: 'Mafia Bot Note',
        });

        if(webhook.token == null) return;

        const client = new WebhookClient({
            id: webhook.id,
            token: webhook.token,
        });

        await archiveMessage(channel as unknown as TextChannel, await setup.primary.chat.messages.fetch(id), client, true);

        client.destroy();

        await webhook.delete();

        if(interaction.type == 'text') {
            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('delete');

            await ref.doc(interaction.message.id).set({
                timestamp: Date.now().valueOf(),
            });

            await interaction.message.delete();
        } else {
            await interaction.editReply("Noted.");
        }
    }
}