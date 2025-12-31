import { Command } from "commander";
import { ActionRowBuilder, ApplicationCommandType, ChannelType, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, InteractionType, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandStringOption, TextInputBuilder, TextInputStyle, WebhookClient } from "discord.js";
import { Data, Event } from '../discord';
import { ReactionCommand } from '../discord';
import { TextCommand } from '../discord';
import { archiveMessage } from "../utils/archive";
import { firebaseAdmin } from "../utils/firebase";
import type { Global } from '../utils/global';
import { getGameByID, getGameSetup } from "../utils/mafia/games";
import { getUser } from "../utils/mafia/user";
import { purgeMessage } from "../utils/mafia/tracking";
import { getWebhook } from "../utils/webhook";
import { z } from "zod";

const SetPeriod = z.object({
    name: z.literal('set-period'),
    value: z.number(),
})

module.exports = {
    data: [
        {
            type: 'context',
            name: 'context-Mark',
            command: new ContextMenuCommandBuilder()
                .setName('Mark')
                .setType(ApplicationCommandType.Message)
        },
        {
            type: 'modal',
            name: 'modal-set-period',
            command: SetPeriod
        }, 
    ] satisfies Data[],

    execute: async function(interaction: Event<ContextMenuCommandInteraction | ModalSubmitInteraction>) {
        interaction.inInstance();

        const global = interaction.instance.global;
        const setup = interaction.instance.setup;
        
        if(!(global.admin.includes(interaction.user.id))) throw new Error("You're not a mod!");

        if(interaction.isContextMenuCommand()) {
            await showModal(interaction, global);
        } else {
            const id = JSON.parse(interaction.customId) as z.infer<typeof SetPeriod>;

            const instance = interaction.fields.getTextInputValue('instance');
            const game = interaction.fields.getTextInputValue('game');
            const type = interaction.fields.getTextInputValue('type');

            const db = firebaseAdmin.getFirestore();
            const ref = db.collection('instances').doc(instance).collection('games').doc(game);

            await ref.update({
                ...(type == "start" ? {
                    start: id.value,
                } : {
                    end: id.value,
                })
            });

            await interaction.reply({ content: "Set.", ephemeral: true });
        }
    }
}


async function showModal(interaction: ContextMenuCommandInteraction, global: Global) {
    if(!interaction.isMessageContextMenuCommand()) return;
    
    const modal = new ModalBuilder()
        .setCustomId(JSON.stringify({ name: 'set-period', value: interaction.targetMessage.createdTimestamp }))
        .setTitle("Set Nickname");

    const instanceInput = new TextInputBuilder()
        .setCustomId('instance')
        .setLabel("Instance")
        .setStyle(TextInputStyle.Short)
        .setValue("");

    const gameInput = new TextInputBuilder()
        .setCustomId('game')
        .setLabel("Game")
        .setStyle(TextInputStyle.Short)
        .setValue("");

    const typeInput = new TextInputBuilder()
        .setCustomId('type')
        .setLabel("Type")
        .setStyle(TextInputStyle.Short)
        .setValue("");

    modal.addComponents([
        new ActionRowBuilder<TextInputBuilder>()
            .addComponents([
                instanceInput
            ]),
        new ActionRowBuilder<TextInputBuilder>()
            .addComponents([
                gameInput
            ]),
        new ActionRowBuilder<TextInputBuilder>()
            .addComponents([
                typeInput
            ])
    ]);

    await interaction.showModal(modal);
}