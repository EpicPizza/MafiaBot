import { Command } from "commander";
import { ApplicationCommandType, ChannelType, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, SlashCommandBuilder, SlashCommandStringOption, WebhookClient } from "discord.js";
import { Data } from '../discord';
import { ReactionCommand } from '../discord';
import { TextCommand } from '../discord';
import { archiveMessage } from "../utils/archive";
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { getGameByID, getGameSetup } from "../utils/mafia/games";
import { getUser } from "../utils/mafia/user";
import { getSetup } from "../utils/setup";
import { purgeMessage } from "../utils/mafia/tracking";
import { getWebhook } from "../utils/webhook";

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
            command: () => {
                return new Command()
                    .name('note')
                    .description('Note a message to send to your DM or mafia chat. Can be accessed in the apps section of message options. Set whether to send a note to your DM channel or mafia chat. Must be run in your dead chat DM.')
                    .option('-s, --send <where>', 'where to send dm (mafia, DM)');
            }
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

    execute: async function(interaction: ContextMenuCommandInteraction | TextCommand | CommandInteraction | ReactionCommand) {
        const global = await getGlobal();
        const setup = await getSetup();
        
        if(interaction.type == 'reaction' && interaction.message.guild?.id != setup.primary.guild.id) return;
        if(interaction.type != "text" && interaction.type != 'reaction') await interaction.deferReply({ ephemeral: true });

        const user = await getUser(interaction.user.id);
        if(user == undefined || !global.players.find(player => player.id == user.id)) {
            if(interaction.type == 'reaction') {
                return;
            } else {
                throw new Error("You're not in this game!");
            }
        }

        const db = firebaseAdmin.getFirestore();

        if((interaction.type != 'text' && interaction.type != 'reaction' && interaction.isChatInputCommand()) || (interaction.type == 'text' && interaction.program.getOptionValue('send'))) {
            const channelId = (interaction.type != 'text' && interaction.isChatInputCommand()) ? interaction.channelId :  interaction.message.channelId;

            if(channelId != user.channel) throw new Error("Must be run in dead chat!");
            
            let sendTo = (interaction.type != 'text' && interaction.isChatInputCommand())  ? interaction.options.getString('send') : interaction.program.getOptionValue('send') as string;

            if(sendTo == null) throw new Error("Where to send not received.");

            sendTo = sendTo == 'mafia' ? sendTo : 'DM';

            const alignment = global.players.find(player => player.id == user.id)?.alignment;

            if(alignment === undefined) throw new Error("Alignment not found.");

            if(alignment != 'mafia' && sendTo == 'mafia') throw new Error("Not allowed! You're not mafia!");

            await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('notes').doc(user.id).set({
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

        if(interaction.type == 'reaction') await interaction.reaction.remove();

        if(interaction.type == 'text' || interaction.type == 'reaction' ? interaction.message.channelId != setup.primary.chat.id : interaction.channelId != setup.primary.chat.id) return;

        const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('notes').doc(user.id); 
        const sendTo = ((await ref.get()).data()?.sendTo ?? 'DM') as 'DM' | 'mafia';

        const channel = setup.secondary.guild.channels.cache.get(user.channel ?? "");
        if(channel == undefined || !(channel.type == ChannelType.GuildText)) throw new Error("Channel not found.");

        const mafiaChannel = (await getGameSetup(await getGameByID(global.game ?? "---"), setup)).mafia;

        if(interaction.type == 'text') await interaction.message.react("✅");

        const webhook = await getWebhook(sendTo == 'mafia' ? mafiaChannel : channel);

        await archiveMessage((sendTo == 'mafia' ? mafiaChannel : channel), await setup.primary.chat.messages.fetch(id), webhook.client, true, user.nickname);

        webhook.destroy();

        if(interaction.type == 'text') {
            purgeMessage(interaction.message);

            await interaction.message.delete();
        } else if(interaction.type != 'reaction') {
            await interaction.editReply("Noted.");
        }
    }
}
