import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, cleanContent, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, Message, MessageType, SlashCommandBuilder, TextChannel } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../utils/firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";
import { TextCommand } from "../discord";
import { getSetup } from "../utils/setup";
import { checkMod } from "../utils/mod";
import { getGlobal, type Global } from '../utils/global';
import { Command } from "commander";
import { getReactions, getReactionsString } from "../utils/archive";

dnt.plugin(meridiem);

let ran = false;

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-collect',
            command: () => {
                return new Command()
                    .name('collect')
                    .description('collect messages in main channel')
            },
        }
    ] satisfies Data[],

    execute: async function(interaction: TextCommand) {
        if(ran) return;

        ran = true;

        const setup = await getSetup();
        const global = await getGlobal();

        if(!(global.admin.includes(interaction.user.id))) throw new Error("You're not a mod!");

        const message = await interaction.message.reply("Fetching messages...");

        const messages = await getMessages(setup.primary.chat, null, async (length: number) => {
            await message.edit("Fetching messages... (" + length + ")");
        });

        await message.edit("Total Fetched Messages: " + messages.length);

        if(interaction.type != 'text') {
            await interaction.reply({ content: "Day set."});
        } else {
            await interaction.message.react("✅");
        }
    }
}

interface Messages {
    id: string,
    sent: number,
    timestamp: number,
    author: string,
    pin: undefined | string
}

async function getMessages(channel: TextChannel, messageId: string | null, callback: Function): Promise<Messages[]> {
    var messageArray = new Array();
    var last = 0;
    var message = messageId;

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('channels').doc(channel.id).collection('messages');

    while(true) {
        var options = { limit: 100, before: message == null ? undefined : message, cache: false }; //cache only stores 200 messages max, so pointless in this case

        const batch = db.batch();

        var messages = await channel.messages.fetch(options);
        await Promise.allSettled(messages.map(async (message: Message) => {
            let pinning: string | undefined = undefined;

            if(message.type == MessageType.ChannelPinnedMessage) {
                pinning = (await message.fetchReference()).url;
            }

            const mentions = [] as string[];

            if(message.mentions.everyone) mentions.push("everyone");
            mentions.push(...message.mentions.users.map(user => "u-" + user.id));
            mentions.push(...message.mentions.roles.map(role => "r-" + role.id));

            const saving = {
                channelId: message.channelId,
                guildId: message.guildId,
                id: message.id,
                createdTimestamp: message.createdTimestamp,
                editedTimestamp: message.editedTimestamp,
                type: message.type,
                content: message.content,
                cleanContent: message.cleanContent,
                authorId: message.author.id,
                pinned: message.pinned,
                pinning: message.type == MessageType.ChannelPinnedMessage ? (await message.fetchReference()).url : null,
                //@ts-expect-error
                embeds: message.toJSON().embeds,
                attachments: message.attachments.toJSON(),
                mentions: mentions,
                reference: message.reference?.messageId ?? null,
                poll: message.poll ? true : false,
                reactions: await getReactions(message),
            }

            batch.set(ref.doc(message.id), saving);

            messageArray.push({id: message.id, pin: pinning, sent: Math.floor(((Date.now().valueOf() - message.createdTimestamp) / (1000 * 3600 * 24))), timestamp: message.createdTimestamp, author: message.author.id });
        }));

        await batch.commit();

        await callback(messageArray.length);

        if (messages.size < 100) {
            break;
        }

        last = messageArray.length;
        message = messageArray[messageArray.length - 1].id;

        await sleep(200);
    }

    return messageArray;
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
