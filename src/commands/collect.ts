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
import { catchupChannel } from "../utils/mafia/tracking";

dnt.plugin(meridiem);

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
        const setup = await getSetup();
        const global = await getGlobal();

        if(!(global.admin.includes(interaction.user.id))) throw new Error("You're not a mod!");

        const message = await interaction.message.reply("Fetching messages...");

        const messagesFetched = await catchupChannel(setup.primary.chat, async (length: number) => {
            await message.edit("Fetching messages... (" + length + ")");
        });

        await message.edit("Total Fetched Messages: " + messagesFetched);

        if(interaction.type != 'text') {
            await interaction.reply({ content: "Messages collected."});
        } else {
            await interaction.message.react("✅");
        }
    }
}
