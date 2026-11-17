import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { firebaseAdmin } from "../../utils/firebase";
import { Subcommand } from "../../utils/subcommands";
import { settingsRef } from "../../utils/mafia/state";

export const HammerCommand = {
    name: "hammer",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("hammer")
        .setDescription("Set auto hammer on or off.")
        .addBooleanOption(option =>
            option  
                .setName('hammer')
                .setDescription('To set auto hammer on or off.')
                .setRequired(true)
        ),
    text: () => {
        return new Command()
            .name('hammer')
            .description('To set auto hammer on or off.')
            .argument('<mode>', 'on or off', fromZod(z.union([ z.literal('on'), z.literal('off') ])));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const type = interaction.type == 'text' ? interaction.program.processedArgs[0] == 'on' : interaction.options.getBoolean('hammer') ?? false;

        console.log(interaction.type == 'text' ? interaction.program.processedArgs : null);

        const db = firebaseAdmin.getFirestore();

        const ref = settingsRef(interaction.instance);

        await ref.update({
            hammer: type,
        });

        if(interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply("Updated.");
        }
    }
} satisfies Subcommand;