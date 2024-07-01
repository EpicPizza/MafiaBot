import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { endGame, getGlobal, setAllignments, startGame } from "../../utils/main";
import { extensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../firebase";
import { FieldValue } from "firebase-admin/firestore";

export const ExtensionCommand = {
    name: "extension",
    description: "?mod extension {enabled | disable | list} *{name}*",
    command: {
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
        text: {
            required: [ z.string().min(1).max(100) ],
            optional: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        const extension = interaction.type == 'text' ? interaction.arguments[2] as string : interaction.options.getString("extension");
        const command = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getSubcommand();

        if(command == null) throw new Error("Extension command not specified.");
        if(command != 'list' && extension == null) throw new Error("Extension name not specified.");

        const enabled = extensions.filter(extension => global.extensions.find(enabled => enabled == extension.name));
        const disabled = extensions.filter(extension => !global.extensions.find(enabled => enabled == extension.name));

        if(command == "list" || extension == null) {
            const embed = new EmbedBuilder()
                .setTitle("Extensions")
                .setColor(Colors.Purple)
                .setDescription("**----- Enabled Extensions -----**" 
                    + (enabled.length == 0 ? "\n\nNo enabled extensions." : enabled.reduce((previous, current) => previous + "\n\n**" + current.name + " Extension**\n" + current.description, "")) + "\n\n"
                    + "**----- Disabled Extensions -----**" 
                    + (disabled.length == 0 ? "\n\nNo disabled extensions." : disabled.reduce((previous, current) => previous + "\n\n**" + current.name + " Extension**\n" + current.description, ""))
                )

            interaction.reply({ embeds: [embed], ephemeral: true });
        } else if(command == "enable") {
            const enabling = disabled.find(enabledExtension => enabledExtension.name.toLowerCase() == extension.toLowerCase() );

            if(enabling == undefined || enabled.find(enabledExtension => enabledExtension.name.toLowerCase() == extension.toLowerCase() )) throw new Error("Extension already enabled.");

            const voteExtension = enabled.find(extension => extension.priority.includes("onVote"));
            const votesExtension = enabled.find(extension => extension.priority.includes("onVotes"));

            if(enabling.priority.includes("onVote") && voteExtension) throw new Error("Cannot be enabled with " + voteExtension.name + " Extension since they both modify vote command.");
            if(enabling.priority.includes("onVotes") && votesExtension) throw new Error("Cannot be enabled with " + votesExtension.name + " Extension since they both modify votes command.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('settings').doc('game');

            await ref.update({
                extensions: FieldValue.arrayUnion(extension.substring(0, 1).toUpperCase() + extension.substring(1, extension.length).toLowerCase())
            });            

            if(interaction.type == 'text') {
                await interaction.message.react("✅");
            } else {
                await interaction.reply({ content: "Extension enabled.", ephemeral: true })
            }
        } else if(command == "disable") {
            if(disabled.find(disabledExtension => disabledExtension.name.toLowerCase() == extension.toLowerCase() )) throw new Error("Extension already disabled.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('settings').doc('game');

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
}