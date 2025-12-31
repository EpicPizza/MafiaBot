import { Command } from "commander";
import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandGroupBuilder } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { getAllExtensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../utils/firebase";
import { Subcommand } from "../../utils/subcommands";

export const ExtensionCommand = {
    name: "extension",
    subcommand: true,

    slash: new SlashCommandSubcommandGroupBuilder()
        .setName("extension")
        .setDescription("Manage extensions.")
        .addSubcommand(subcommand =>
            subcommand 
                .setName("enable")
                .setDescription("Enable extension.")
                .addStringOption(option =>
                    option
                        .setName("extension")
                        .setDescription("Name of extension.")
                        .setRequired(true)
                        .setAutocomplete(true)    
                )
        )
        .addSubcommand(subcommand =>
            subcommand 
                .setName("disable")
                .setDescription("Disable extension.")
                .addStringOption(option =>
                    option
                        .setName("extension")
                        .setDescription("Name of extension.")
                        .setRequired(true)
                        .setAutocomplete(true)    
                )
        )
        .addSubcommand(subcommand =>
            subcommand 
                .setName("list")
                .setDescription("List all enabled and disabled extension.")
        ),
    text: () => {
        return new Command()
            .name('extension')
            .description('manage extensions')
            .argument('<action>', 'list, enable, disable', fromZod(z.string().min(1).max(100)))
            .argument('[name]', 'name of extension', fromZod(z.string().min(1).max(100)))
    },
    
    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const global = interaction.instance.global;

        const extension = interaction.type == 'text' ? interaction.program.processedArgs[1] as string | undefined ?? null : interaction.options.getString("extension");
        const command = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getSubcommand();

        if(command == null) throw new Error("Extension command not specified.");
        if(command != 'list' && extension == null) throw new Error("Extension name not specified.");

        const enabled = getAllExtensions().filter(extension => global.extensions.find(enabled => enabled == extension.name));
        const disabled = getAllExtensions().filter(extension => !global.extensions.find(enabled => enabled == extension.name));

        if(command == "list" || extension == null) {
            const list =  getAllExtensions().reduce((previous, current) => previous + "\n\n" + (enabled.find(extension => extension.name == current.name) ? ":white_check_mark: " : "<:cross:1258228069156655259> ") + "**" + current.name + " Extension**\n" + current.description, "");

            const embed = new EmbedBuilder()
                .setTitle("Extensions")
                .setColor(Colors.Purple)
                .setDescription(
                   list == "" ? "No extensions found." : list
                )

            interaction.reply({ embeds: [embed], ephemeral: true });
        } else if(command == "enable") {
            if(global.started) throw new Error("Cannot enable or disable extensions if the game has already started.");
            
            const enabling = disabled.find(disabledExtension => disabledExtension.name.toLowerCase() == extension.toLowerCase() );

            if(enabling == undefined || enabled.find(enabledExtension => enabledExtension.name.toLowerCase() == extension.toLowerCase() )) throw new Error("Extension already enabled/not found.");

            const voteExtension = enabled.find(extension => extension.priority.includes("onVote"));
            const votesExtension = enabled.find(extension => extension.priority.includes("onVotes"));

            if(enabling.priority.includes("onVote") && voteExtension) throw new Error("Cannot be enabled with " + voteExtension.name + " Extension since they both modify vote command.");
            if(enabling.priority.includes("onVotes") && votesExtension) throw new Error("Cannot be enabled with " + votesExtension.name + " Extension since they both modify votes command.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('instances').doc(interaction.instance.id).collection('settings').doc('game');

            await ref.update({
                extensions: FieldValue.arrayUnion(extension.substring(0, 1).toUpperCase() + extension.substring(1, extension.length).toLowerCase())
            });            

            if(interaction.type == 'text') {
                await interaction.message.react("✅");
            } else {
                await interaction.reply({ content: "Extension enabled.", ephemeral: true })
            }
        } else if(command == "disable") {
            if(global.started) throw new Error("Cannot enable or disable extensions if the game has already started.");

            if(disabled.find(disabledExtension => disabledExtension.name.toLowerCase() == extension.toLowerCase() )) throw new Error("Extension already disabled.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('instances').doc(interaction.instance.id).collection('settings').doc('game');

            await ref.update({
                extensions: FieldValue.arrayRemove(extension.substring(0, 1).toUpperCase() + extension.substring(1, extension.length).toLowerCase())
            });     

            if(interaction.type == 'text') {
                await interaction.message.react("✅");
            } else {
                await interaction.reply({ content: "Extension disabled.", ephemeral: true })
            }
        }
    }
} satisfies Subcommand;