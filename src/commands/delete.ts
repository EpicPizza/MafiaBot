import { Command } from "commander";
import { ApplicationCommandType, ContextMenuCommandBuilder, ContextMenuCommandInteraction } from "discord.js";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { firebaseAdmin } from "../utils/firebase";
import { checkMod } from "../utils/mod";
import { purgeMessage } from "../utils/mafia/tracking";

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

    execute: async function(interaction: Event<ContextMenuCommandInteraction | TextCommand>) {
        interaction.inInstance();

        const setup = interaction.instance.setup;
        const global = interaction.instance.global;

        await checkMod(setup, global, interaction.user.id, 'message' in interaction ? interaction.message?.guild?.id ?? "" : interaction.guildId ?? "");

        if(interaction.type != 'text' && !interaction.isMessageContextMenuCommand()) throw new Error("Unable to fetch message.");

        const db = firebaseAdmin.getFirestore();

        const target = interaction.type == 'text' ? await interaction.message.fetchReference() : interaction.targetMessage;
        const message = interaction.type == 'text' ? interaction.message : -1;

        if(message == undefined) return await interaction.reply("Unable to fetch message.");

        if(message != -1) {
            purgeMessage(message);

            await message.delete();
        }

        purgeMessage(target);

        await target.delete();

        if(interaction.type != 'text') {
            await interaction.reply({ content: "Message deleted.", ephemeral: true });
        }
    }
}
