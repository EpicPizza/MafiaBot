import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { endGame, startGame } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";

export const HammerCommand = {
    name: "hammer",
    description: "?mod hammer {on|off}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("hammer")
            .setDescription("Set auto hammer on or off.")
            .addBooleanOption(option =>
                option  
                    .setName('hammer')
                    .setDescription('To set auto hammer on or off.')
                    .setRequired(true)
            ),
        text: {
            required: [ z.union([ z.literal('on'), z.literal('off') ]) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const type = interaction.type == 'text' ? interaction.arguments[1] == 'on' : interaction.options.getBoolean('hammer') ?? false;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('game');

        await ref.update({
            hammer: type,
        });

        if(interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply("Updated.");
        }
    }
}