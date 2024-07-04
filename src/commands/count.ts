import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, Message, SlashCommandBuilder, TextChannel } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";
import { Command } from "../discord";
import { getSetup } from "../utils/setup";

dnt.plugin(meridiem);

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-count',
            command: {},
        }
    ] satisfies Data[],

    execute: async function(interaction: Command) {
        const setup = await getSetup();

        const member = await setup.primary.guild.members.fetch(interaction.user.id);
        if(!member?.roles.cache.has(setup.primary.mod.id)) throw new Error("You're not a mod!");

        const message = await interaction.message.reply("Fetching messages...");

        const messages = await getMessages(setup.primary.chat, null, async (length: number) => {
            await message.edit("Fetching messages... (" + length + ")");
        })

        await message.edit("Fetched Messages:\n\nTotal Messages: " + messages.length + "\nFirst Message: https://discord.com/channels/" + setup.primary.chat.guildId + "/" + setup.primary.chat.id + "/" + messages[messages.length - 1].id);
    }
}

interface Messages {
    id: string,
    sent: number,
    timestamp: number,
    author: string,
}

async function getMessages(channel: TextChannel, messageId: string | null, callback: Function): Promise<Messages[]> {
    var messageArray = new Array();
    var last = 0;
    var message = messageId;

    while(true) {
        var options = { limit: 100, before: message == null ? undefined : message, cache: false }; //cache only stores 200 messages max, so pointless in this case

        var messages = await channel.messages.fetch(options);
        messages.forEach((announcement: Message) => {
            messageArray.push({id: announcement.id, sent: Math.floor(((Date.now().valueOf() - announcement.createdTimestamp) / (1000 * 3600 * 24))), timestamp: announcement.createdTimestamp, author: announcement.author.id });
        })

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
