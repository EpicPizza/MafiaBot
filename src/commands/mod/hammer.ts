import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { firebaseAdmin } from "../../utils/firebase";
import { Subcommand } from "../../utils/subcommands";
import { gameRef, resolveGame } from "../../utils/mafia/games";

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
        )
        .addStringOption(option =>
            option
                .setName('game')
                .setDescription('Game to change. Defaults to the running game.')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('hammer')
            .description('To set auto hammer on or off.')
            .argument('<mode>', 'on or off', fromZod(z.union([ z.literal('on'), z.literal('off') ])))
            .option('-g, --game <name>', 'game to change, defaults to the running game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const type = interaction.type == 'text' ? interaction.program.processedArgs[0] == 'on' : interaction.options.getBoolean('hammer') ?? false;

        console.log(interaction.type == 'text' ? interaction.program.processedArgs : null);

        const db = firebaseAdmin.getFirestore();

        const game = await resolveGame(interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined : interaction.options.getString('game'), interaction.instance);

        const ref = gameRef(interaction.instance, game.id);

        await ref.update({
            hammer: type,
        });

        if(interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply("Auto hammer " + (type ? "on" : "off") + " for " + game.name + ".");
        }
    }
} satisfies Subcommand;