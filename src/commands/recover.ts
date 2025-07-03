import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, Message, MessageType, SlashCommandBuilder, TextChannel } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";
import { Command } from "../discord";
import { getSetup } from "../utils/setup";
import { checkMod } from "../utils/mod";

dnt.plugin(meridiem);

let ran = false;

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-recover',
            command: {},
        }
    ] satisfies Data[],

    execute: async function(interaction: Command) {
        if(ran) return;

        ran = true;

        const setup = await getSetup();

        checkMod(setup, interaction.user.id, interaction.message?.guild?.id ?? "");

        const message = await interaction.message.reply("Fetching messages...");

        const messages = await getMessages(setup.primary.chat, null, async (length: number) => {
            await message.edit("Fetching messages... (" + length + ")");
        });

        const pins = (messages.filter(message => message.pin != undefined).reduce((prev, curr) => prev + curr.pin + "\n", ""));

        await message.edit("Total Fetched Messages: " + messages.length);

        const buffer = Buffer.from(pins, 'utf-8');
        const attachment = {
            attachment: buffer,
            name: 'pins.txt'
        };

        await message.reply({ files: [attachment] });
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

    while(true) {
        var options = { limit: 100, before: message == null ? undefined : message, cache: false }; //cache only stores 200 messages max, so pointless in this case

        var messages = await channel.messages.fetch(options);
        Promise.all(messages.map(async (announcement: Message) => {
            let pinning: string | undefined = undefined;

            if(announcement.type == MessageType.ChannelPinnedMessage) {
                pinning = (await announcement.fetchReference()).url;
            }

            messageArray.push({id: announcement.id, pin: pinning, sent: Math.floor(((Date.now().valueOf() - announcement.createdTimestamp) / (1000 * 3600 * 24))), timestamp: announcement.createdTimestamp, author: announcement.author.id });
        }));

        await callback(messageArray.length);

        if(messageArray.length < last + 100 || last == messageArray.length) {
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
