import { Command } from "commander";
import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Colors, ContextMenuCommandBuilder, ContextMenuCommandInteraction, EmbedBuilder } from "discord.js";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { firebaseAdmin } from "../utils/firebase";
import { snipeMessage } from "../utils/google/doc";
import { getSetup } from "../utils/setup";

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
                    .description('reply this to a message to see it\'s edits');
            },
        }
    ] satisfies Data[],

    execute: async function(interaction: ContextMenuCommandInteraction | TextCommand) {
        const setup = await getSetup();
        
        if(interaction.type == 'text' ? interaction.message.guildId != setup.primary.guild.id : interaction.guildId != setup.primary.guild.id) throw new Error("Does not work outside of bag mafia main chat!");

        if(interaction.type != 'text' && !interaction.isMessageContextMenuCommand()) throw new Error("Unable to fetch message.");

        const db = firebaseAdmin.getFirestore();

        const id = interaction.type == 'text' ? interaction.message.reference?.messageId : interaction.targetMessage.id;

        if(id == undefined) throw new Error("Must refer to a message to snipe.");

        const ref = db.collection('edits').doc(id);

        const doc = await ref.get();

        const data = doc.data();

        const rows = interaction.type != 'text' ? [
            new ActionRowBuilder<ButtonBuilder>()
                .addComponents([
                    new ButtonBuilder()
                        .setEmoji('⤴️')
                        .setStyle(ButtonStyle.Link)
                        .setURL("https://discord.com/channels/" + interaction.targetMessage.guildId + "/" + interaction.targetMessage.channelId + "/" + interaction.targetMessage.id)
                ])
        ] : [];

        const embeds = await snipeMessage(await setup.primary.chat.messages.fetch({ message: id, cache: true}));

        if(data == undefined) return await interaction.reply({ content: "No edits recorded.", embeds: [ ... embeds ], components: rows });

        const edits = data.edits as { content: string, timestamp: number }[];

        const embed = new EmbedBuilder()
            .setTitle("Edits")
            .setColor(Colors.Red)
            .setDescription(edits.reduce((previous, current) => {
                return previous += "[<t:" + Math.round(new Date(current.timestamp).valueOf() / 1000) + ":T>, <t:" + Math.round(new Date(current.timestamp).valueOf() / 1000) + ":d>] - `" + current.content.replaceAll("`", "'") + "`\n";
            }, ""));

        await interaction.reply({ embeds: [embed, ...embeds ], components: rows });
    }
}