import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, cleanContent, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, Message, MessageType, SlashCommandBuilder, TextChannel } from "discord.js";
import { Data, Event } from "../discord";
import { firebaseAdmin } from "../utils/firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";
import { TextCommand } from "../discord";
import { getSetup } from "../utils/setup";
import { checkMod } from "../utils/mod";
import { type Global } from '../utils/global';
import { Command } from "commander";
import { getReactions, getReactionsString } from "../utils/archive";
import { addStatsAction, catchupChannel, setInitialized, TrackedMessage } from "../utils/mafia/tracking";
import { fromZod } from "../utils/text";
import { z } from "zod";
import { removeReactions } from "../discord/helpers";

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
        },
        {
            type: 'text',
            name: 'text-poll',
            command: () => {
                return new Command()
                    .name('poll')
                    .description('set stats for a certain period')
                    .argument("<game>", "game", fromZod(z.string()))
                    .argument("<instance>", "instance", fromZod(z.string()))
                    .argument("<channel>", "channel", fromZod(z.string()))
                    .argument("<day>", "day", fromZod(z.coerce.number().int()))
                    .argument("<start>", "start period", fromZod(z.coerce.number().int()))
                    .argument("<end>", "end period", fromZod(z.coerce.number().int()))
            },
        }
    ] satisfies Data[],

    execute: async function(interaction: Event<TextCommand>) {
        interaction.inInstance();

        const setup = interaction.instance.setup;
        const global = interaction.instance.global;

        if(!(global.admin.includes(interaction.user.id))) throw new Error("You're not a mod!");

        if(interaction.name == "collect") {
            const message = await interaction.message.reply("Fetching messages...");

            setInitialized(true);

            const messagesFetched = await catchupChannel(setup.primary.chat, async (length: number) => {
                await message.edit("Fetching messages... (" + length + ")");
            }, false);

            await message.edit("Total Fetched Messages: " + messagesFetched);

            if(interaction.type != 'text') {
                await interaction.reply({ content: "Messages collected."});
            } else {
                await interaction.message.react("✅");
            }
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");

            const game = interaction.program.processedArgs[0] as string;
            const instance = interaction.program.processedArgs[1] as string;
            const channel = interaction.program.processedArgs[2] as string;
            const day = interaction.program.processedArgs[3] as number;
            const start = interaction.program.processedArgs[4] as number;
            const end = interaction.program.processedArgs[5] as number;

            console.log(game, instance, channel, day, start, end)

            const db = firebaseAdmin.getFirestore();

            let offset = 0;
            
            while(true) {
                const ref = db.collection('channels').doc(channel).collection('messages').orderBy('createdTimestamp', 'asc').where('createdTimestamp', '>=', start).where('createdTimestamp', '<=', end).limit(500).offset(offset);
                const trackedMessages = ((await ref.get()).docs.map(doc => doc.data()) as (TrackedMessage | { deleted: true })[]).filter(message => 'authorId' in message);

                offset += 500;

                trackedMessages.forEach(message => {
                    addStatsAction({
                        type: 'add',
                        id: message.authorId,
                        instance: instance,
                        game: game,
                        day: day,
                        messages: 1,
                        words: message.content.split(" ").length,
                        images: 0,
                    });
                });

                console.log("found", trackedMessages.length);

                if(trackedMessages.length < 500) break;
            }

            await removeReactions(interaction.message);
            await interaction.message.react("✅");
        }
    }
}
