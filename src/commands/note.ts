import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, InteractionType, SlashCommandBuilder, SlashCommandStringOption, TextChannel, WebhookClient } from "discord.js";
import { Data, ReactionCommand } from "../discord";
import { firebaseAdmin } from "../firebase";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { DateTime } from "luxon";
import { Command } from "../discord";
import { getSetup } from "../utils/setup";
import { getGameByID, getGlobal } from "../utils/main";
import { getUser } from "../utils/user";
import { archiveMessage } from "../archive";
import { z } from "zod";
import { getGameSetup } from "../utils/games";

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
            command: {
                optional: [ z.literal('send'), z.string() ]
            },
        },
        {   
            type: 'slash',
            name: 'slash-note',
            command: new SlashCommandBuilder()
                .setName('note')
                .setDescription('Select where to send notes.')
                .addStringOption(new SlashCommandStringOption()
                    .setName('send')
                    .setDescription('DM for your dead chat dm, or Mafia for mafia chat.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'DM', value: 'DM' },
                        { name: 'mafia', value: 'mafia' },
                    )
                )
        },
        {
            type: 'reaction',
            name: 'reaction-note',
            command: '📝'
        }
    ] satisfies Data[],

    execute: async function(interaction: ContextMenuCommandInteraction | Command | CommandInteraction | ReactionCommand) {
        const global = await getGlobal();
        const setup = await getSetup();
        
        if(interaction.type == 'reaction' && interaction.message.guild?.id != setup.primary.guild.id) return;
        
        if(interaction.type == 'reaction') await interaction.reaction.remove();

        if(interaction.type != "text" && interaction.type != 'reaction') await interaction.deferReply({ ephemeral: true });

        const user = await getUser(interaction.user.id);
        if(user == undefined || !global.players.find(player => player.id == user.id)) throw new Error("You're not in this game!");

        const db = firebaseAdmin.getFirestore();

        if((interaction.type != 'text' && interaction.type != 'reaction' && interaction.isChatInputCommand()) || (interaction.type == 'text' && interaction.arguments.length > 0)) {
            const channelId = (interaction.type != 'text' && interaction.isChatInputCommand()) ? interaction.channelId :  interaction.message.channelId;

            if(channelId != user.channel) throw new Error("Must be run in dead chat!");
            
            let sendTo = (interaction.type != 'text' && interaction.isChatInputCommand())  ? interaction.options.getString('send') : interaction.arguments[1] as string;

            if(sendTo == null) throw new Error("Where to send not received.");

            sendTo = sendTo == 'mafia' ? sendTo : 'DM';

            const alignment = global.players.find(player => player.id == user.id)?.alignment;

            if(alignment === undefined) throw new Error("Alignment not found.");

            if(alignment != 'mafia' && sendTo == 'mafia') throw new Error("Not allowed! You're not mafia!");

            await db.collection('notes').doc(user.id).set({
                sendTo,
            });

            if(interaction.type == 'text') {
                await interaction.message.react("✅");
            } else {
                await interaction.editReply("Noted.");
            }

            return;
        }

        if(interaction.type != 'text' && interaction.type != 'reaction' && !interaction.isMessageContextMenuCommand()) throw new Error("Unable to fetch message.");

        const id = interaction.type == 'reaction' ? interaction.message.id : (interaction.type == 'text' ? interaction.message.reference?.messageId : interaction.targetMessage.id);
        if(id == undefined) throw new Error("Must refer to a message to note.");

        if(interaction.type == 'text' || interaction.type == 'reaction' ? interaction.message.channelId != setup.primary.chat.id : interaction.channelId != setup.primary.chat.id) throw new Error("Not main chat!");

        const ref = db.collection('notes').doc(user.id); 
        const sendTo = ((await ref.get()).data()?.sendTo ?? 'DM') as 'DM' | 'mafia';

        const channel = setup.secondary.guild.channels.cache.get(user.channel ?? "");
        if(channel == undefined || !(channel.type == ChannelType.GuildText)) throw new Error("Channel not found.");

        const mafiaChannel = (await getGameSetup(await getGameByID(global.game ?? "---"), setup)).mafia;

        if(interaction.type == 'text') await interaction.message.react("✅");

        const webhook = await (sendTo == 'mafia' ? mafiaChannel : channel).createWebhook({
            name: 'Mafia Bot Note',
        });

        if(webhook.token == null) return;

        const client = new WebhookClient({
            id: webhook.id,
            token: webhook.token,
        });

        await archiveMessage((sendTo == 'mafia' ? mafiaChannel : channel), await setup.primary.chat.messages.fetch(id), client, true, user.nickname);

        client.destroy();

        await webhook.delete();

        if(interaction.type == 'text') {
            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('delete');

            await ref.doc(interaction.message.id).set({
                timestamp: Date.now().valueOf(),
            });

            await interaction.message.delete();
        } else if(interaction.type != 'reaction') {
            await interaction.editReply("Noted.");
        }
    }
}