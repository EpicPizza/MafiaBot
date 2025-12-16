import { Command } from "commander";
import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Colors, ContextMenuCommandBuilder, ContextMenuCommandInteraction, EmbedBuilder } from "discord.js";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { firebaseAdmin } from "../utils/firebase";
import { snipeMessage } from "../utils/google/doc";
import { getSetup } from "../utils/setup";
import { fetchMessage } from "../utils/mafia/tracking";

module.exports = {
    data: [
        {
            type: 'context',
            name: 'context-Snipe',
            command: new ContextMenuCommandBuilder()
                .setName('Snipe')
                .setType(ApplicationCommandType.Message)
        },
        {
            type: 'text',
            name: 'text-snipe',
            command: () => {
                return new Command()
                    .name('snipe')
                    .description('Check edits for a message. Can be accessed in the apps section of message options.');
            },
        }
    ] satisfies Data[],

    execute: async function(interaction: ContextMenuCommandInteraction | TextCommand) {
        const setup = await getSetup();
        
        if(interaction.type == 'text' ? interaction.message.guildId != setup.primary.guild.id : interaction.guildId != setup.primary.guild.id) throw new Error("Does not work outside of bag mafia main chat!");
        if(interaction.type != 'text' && !interaction.isMessageContextMenuCommand()) throw new Error("Unable to fetch message.");

        const message = interaction.type == 'text' ? await interaction.message.fetchReference() : interaction.targetMessage;
        if(message == undefined) throw new Error("Must refer to a message to snipe.");

        let tracked = await fetchMessage(message);

        console.log(tracked);
        console.log(tracked && 'sniped' in tracked);

        if(tracked && 'sniped' in tracked && tracked.sniped) tracked = await fetchMessage({ channelId: message.channelId, id: tracked.sniped as string, partial: true });

        const embeds = await snipeMessage(await setup.primary.chat.messages.fetch({ message: message.id, cache: true}));

        if(tracked == undefined || !('createdTimestamp' in tracked)) return await interaction.reply({ content: "No edits recorded.", embeds: [ ... embeds ] });

        const edits = [... (tracked.logs ?? []), { content: message.content, timestamp: message.editedTimestamp ?? message.createdTimestamp } ].sort((a, b) => a.timestamp - b.timestamp) satisfies { content: string, timestamp: number }[];

        if(edits.length < 2) return await interaction.reply({ content: "No edits recorded.", embeds: [ ... embeds ] });

        const embed = new EmbedBuilder()
            .setTitle("Edits")
            .setColor(Colors.Red)
            .setDescription(edits.reduce((previous, current) => {
                return previous += "[<t:" + Math.round(new Date(current.timestamp).valueOf() / 1000) + ":T>, <t:" + Math.round(new Date(current.timestamp).valueOf() / 1000) + ":d>] - `" + current.content.replaceAll("`", "'") + "`\n";
            }, ""));

        await interaction.reply({ embeds: [embed, ...embeds ] });
    }
}