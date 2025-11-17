import { Command } from "commander";
import { ApplicationCommandType, ContextMenuCommandBuilder, ContextMenuCommandInteraction } from "discord.js";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";

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
            command: () => {
                return new Command()
                    .name('delete')
                    .description('Deletes message without triggering bot delete logger. Can be accessed in the apps section of message options, or replying ?delete to the wanted message.')
            },
        }
    ] satisfies Data[],

    execute: async function(interaction: ContextMenuCommandInteraction | TextCommand) {
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
