import { ActionRow, ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Embed, EmbedBuilder, SlashCommandBuilder, time } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../utils/firebase";
import { Command } from "../discord";
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";
import { getGlobal } from "../utils/main";

module.exports = {
    data: [
        {
            type: 'context',
            name: 'context-Delete',
            command: new ContextMenuCommandBuilder()
                .setName('Delete')
                .setType(ApplicationCommandType.Message)
        },
        {
            type: 'text',
            name: 'text-delete',
            command: {},
        }
    ] satisfies Data[],

    execute: async function(interaction: ContextMenuCommandInteraction | Command) {
        const setup = await getSetup();
        const global = await getGlobal();

        await checkMod(setup, global, interaction.user.id, 'message' in interaction ? interaction.message?.guild?.id ?? "" : interaction.guildId ?? "");

        if(interaction.type != 'text' && !interaction.isMessageContextMenuCommand()) throw new Error("Unable to fetch message.");

        const db = firebaseAdmin.getFirestore();

        const target = interaction.type == 'text' ? await interaction.message.fetchReference() : interaction.targetMessage;
        const message = interaction.type == 'text' ? interaction.message : -1;

        if(message == undefined) return await interaction.reply("Unable to fetch message.");

        const ref = db.collection('delete');

        if(message != -1) {
            await ref.doc(message.id).set({
                timestamp: Date.now().valueOf(),
            });

            await message.delete();
        }

        await ref.doc(target.id).set({
            timestamp: Date.now().valueOf(),
        });

        await target.delete();

        if(interaction.type != 'text') {
            await interaction.reply({ content: "Message deleted.", ephemeral: true });
        }
    }
}
