import { Command } from "commander";
import { ChannelType, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { getEnabledExtensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../utils/firebase";
import { type Global } from '../../utils/global';
import { getGameByID, getGameSetup, Signups } from "../../utils/mafia/games";
import { getUserByName } from "../../utils/mafia/user";
import { getSetup, Setup, } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";
import { Instance } from "../../utils/instance";
import { fetchMessage, updateSnipeMessage } from "../../utils/mafia/tracking";
import { getWebhook } from "../../utils/webhook";
import { archiveMessage } from "../../utils/archive";

export const RecoverCommand = {
    name: "recover",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("recover")
        .setDescription("Recover a message.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Id of message.")
                .setRequired(true)),
    text: () => {
        return new Command()
            .name('recover')
            .description('Recover a message.')
            .argument('<id>', 'id of message', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const messageId = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('id');
        if(messageId == null) throw new Error("Specify an id.");

        const channel = interaction.type == 'text' ? interaction.message.channel : interaction.channel;
        if(channel == null) throw new Error("Not in channel?");

        const tracked = await fetchMessage({ channelId: channel.id, id: messageId, partial: true });
        if(!tracked || !('createdTimestamp' in tracked)) throw new Error("Message not found!");

        if(!('fetchWebhooks' in channel) || channel.type != ChannelType.GuildText) return;
        const webhook = await getWebhook(channel);

        const result = await archiveMessage(channel, tracked, webhook.client, true, undefined, true);
        
        webhook.destroy();

        await updateSnipeMessage({ channelId: result.channel_id, id: result.id }, messageId);
        
        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Message recovered."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;
