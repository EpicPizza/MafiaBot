import { Command } from "commander";
import { ChannelType, ChatInputCommandInteraction, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
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
import { archiveMessage, completeMessage, getReactions } from "../../utils/archive";

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

        const channel = interaction.instance.setup.primary.chat;

        const tracked = await fetchMessage({ channelId: channel.id, id: messageId, partial: true });
        if(!tracked || !('createdTimestamp' in tracked)) throw new Error("Message not found!");

        // if(!('fetchWebhooks' in channel) || channel.type != ChannelType.GuildText) return;
        // const webhook = await getWebhook(channel);

        const message = await completeMessage(tracked, "reduced");

        const content = "💫 **" + message.stars + "** https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.id;

        const embed = new EmbedBuilder()
            .setAuthor({ name: message.nickname ?? message.username, iconURL: message.avatarURL })
            .setFooter({ text: new Date(message.createdTimestamp).toLocaleString() });

        if(message.content.length > 0 || (message.reactions?.length ?? 0) > 0) embed.setDescription(message.content + "\n\n" + message.reactions);
        
        const image = message.attachments.find(attachment => 'contentType' in attachment && typeof attachment.contentType == 'string' && attachment.contentType.startsWith("image"));
        if(image) embed.setImage(image.url);

        // webhook.destroy();

        // await updateSnipeMessage({ channelId: result.channel_id, id: result.id }, messageId);
        
        if(interaction.type != 'text') {
            await interaction.editReply({ embeds: [embed], content: content });
        } else {
            await removeReactions(interaction.message);

           interaction.message.reply({ embeds: [embed], content: content });
        }
    }
} satisfies Subcommand;
