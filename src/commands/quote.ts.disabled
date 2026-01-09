import { Command } from "commander";
import { ActionRowBuilder, ApplicationCommandType, ChannelType, ChatInputCommandInteraction, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, InteractionType, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandStringOption, TextInputBuilder, TextInputStyle, WebhookClient } from "discord.js";
import { Data, Event } from '../discord';
import { ReactionCommand } from '../discord';
import { TextCommand } from '../discord';
import { archiveMessage } from "../utils/archive";
import { firebaseAdmin } from "../utils/firebase";
import type { Global } from '../utils/global';
import { getGameByID, getGameSetup } from "../utils/mafia/games";
import { getUser } from "../utils/mafia/user";
import { createMessage, fetchMessage, purgeMessage } from "../utils/mafia/tracking";
import { getWebhook } from "../utils/webhook";
import { z } from "zod";

const SetQuote = z.object({
    name: z.literal('set-quote'),
    id: z.string(),
})

module.exports = {
    data: [
        {
            type: 'context',
            name: 'context-Quote',
            command: new ContextMenuCommandBuilder()
                .setName('Quote')
                .setType(ApplicationCommandType.Message)
        },
        {
            type: 'modal',
            name: 'modal-set-quote',
            command: SetQuote
        }, 
        {
            type: 'slash',
            name: 'slash-quote',
            command: new SlashCommandBuilder()
                .setName('quote')
                .setDescription('Show a message from your saved quotes!')
                .addStringOption(option =>
                    option  
                        .setName('name')
                        .setDescription('Name of quote?')
                        .setRequired(true)
                )
        }
    ] satisfies Data[],

    execute: async function(interaction: Event<ContextMenuCommandInteraction | ModalSubmitInteraction | ChatInputCommandInteraction>) {
        if(interaction.isContextMenuCommand()) {
            await showModal(interaction);
        } else if(interaction.isModalSubmit()) {
            const id = JSON.parse(interaction.customId) as z.infer<typeof SetQuote>;

            const name = interaction.fields.getTextInputValue('name');

            const db = firebaseAdmin.getFirestore();

            const exists = (await db.collection('quotes').where('author', '==', interaction.user.id).where('name', '==', name).get()).docs.length > 0;
            if(exists) throw new Error("You already have a quote with this name!");

            const channel = interaction.channel;
            if(channel?.type != ChannelType.GuildText) throw new Error("Mot in channel?");
           
            const tracked = await fetchMessage({ channelId: channel.id, id: id.id, partial: true });
            
            if(tracked == undefined || !('authorId' in tracked)) {
                const message = await interaction.channel?.messages.fetch(id.id);
                if(message == undefined) throw new Error("Unable to save message for quote!");

                await createMessage(message, false); //checks false since this could be outside of normally tracked channels
            }

            await db.collection('quotes').add({
                author: interaction.user.id,
                guild: interaction.guildId,
                channel: interaction.channelId,
                id: id.id,
                name: name,
            });

            await interaction.reply({ content: "Quote saved!", ephemeral: true });
        } else if(interaction.isChatInputCommand()) {
            await interaction.deferReply({ ephemeral: true });

            const quoteName = interaction.options.getString('name');
            if(quoteName == null) throw new Error("Quote name?");

            const channel = interaction.channel;
            if(channel == null) throw new Error("Not in channel?");
            
            if(!('permissionsFor' in channel)) throw new Error("Unable to check permissions?");
            const permissions = channel.permissionsFor(interaction.client.user!.id);
            if(!permissions?.has('ManageWebhooks')) throw new Error("Not able to send quote in this channel!");

            const db = firebaseAdmin.getFirestore();
            const quotes = (await db.collection('quotes').where('author', '==', interaction.user.id).where('name', '==', quoteName).get()).docs;

            if(quotes.length > 1) throw new Error("Duplicate quote found?");
            if(quotes.length == 0) throw new Error("No quote found with this name!");

            const quote = quotes[0].data() as {
                author: string,
                guild: string,
                channel: string,
                id: string,
                name: string
            };

            const tracked = await fetchMessage({ channelId: quote.channel, id: quote.id, partial: true });
            if(tracked == undefined || !('authorId' in tracked)) throw new Error("Unable to find quoted message!");

            if(!('fetchWebhooks' in channel) || channel.type != ChannelType.GuildText) return;
            const webhook = await getWebhook(channel);
    
            await archiveMessage(channel, tracked, webhook.client, true, undefined, true);
            
            webhook.destroy();
    
            await interaction.editReply({ content: "Quoted!" });
        }
    }
}


async function showModal(interaction: ContextMenuCommandInteraction) {
    if(!interaction.isMessageContextMenuCommand()) return;
    
    const modal = new ModalBuilder()
        .setCustomId(JSON.stringify({ name: 'set-quote', id: interaction.targetMessage.id }))
        .setTitle("Quote Name");

    const instanceInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel("What do you want this quote to be named?")
        .setStyle(TextInputStyle.Short)
        .setValue("");

    modal.addComponents([
        new ActionRowBuilder<TextInputBuilder>()
            .addComponents([
                instanceInput
            ]),
    ]);

    await interaction.showModal(modal);
}