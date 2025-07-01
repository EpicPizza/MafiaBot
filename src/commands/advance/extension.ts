import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { endGame, getGameByID, getGlobal, startGame } from "../../utils/main";
import { extensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../firebase";
import { FieldValue } from "firebase-admin/firestore";
import { getSetup } from "../../utils/setup";

export const ExtensionCommand = {
    name: "extension",
    description: "?adv extension {enabled | disable} *{name}* {start/end: true|false}",
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
                    .addBooleanOption(option =>
                        option
                            .setName('start')
                            .setDescription("Whether to run start function or not.")
                            .setRequired(true)
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
                    .addBooleanOption(option =>
                        option
                            .setName('end')
                            .setDescription("Whether to run end function or not.")
                            .setRequired(true)
                    )
            ),
        text: {
            required: [ z.string().min(1).max(100), z.string().min(1).max(100), z.coerce.boolean() ],
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        const extension = interaction.type == 'text' ? interaction.arguments[2] as string : interaction.options.getString("extension");
        const command = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getSubcommand();
        const start = interaction.type == 'text' ? interaction.arguments[3] as boolean : interaction.options.getBoolean("start");
        const end = interaction.type == 'text' ? interaction.arguments[3] as boolean : interaction.options.getBoolean("end");

        console.log(interaction.type == 'text' ? interaction.arguments : []);
        console.log(start, end);

        if(command == null) throw new Error("Arguments not specified.");
        if(extension == null) throw new Error("Extension name not specified.");

        const enabled = extensions.filter(extension => global.extensions.find(enabled => enabled == extension.name));
        const disabled = extensions.filter(extension => !global.extensions.find(enabled => enabled == extension.name));

        if(command == "enable") {
            //if(global.started) throw new Error("Cannot enable or disable extensions if the game has already started."); ADVANCE?
            
            const enabling = disabled.find(disabledExtension => disabledExtension.name.toLowerCase() == extension.toLowerCase() );

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
            
            if(start === true) {
                const setup = await getSetup();
                const game = await getGameByID(global.game ?? "---");
                
                await enabling.onStart(global, setup, game);
            }

            if(interaction.type == 'text') {
                await interaction.message.react("✅");
            } else {
                await interaction.reply({ content: "Extension enabled.", ephemeral: true })
            }
        } else if(command == "disable") {
            //if(global.started) throw new Error("Cannot enable or disable extensions if the game has already started."); //ADVANCE?

            const disabling = enabled.find(enabledExtension => enabledExtension.name.toLowerCase() == extension.toLowerCase() );

            if(disabling == undefined || disabled.find(disabledExtension => disabledExtension.name.toLowerCase() == extension.toLowerCase() )) throw new Error("Extension already disabled.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('settings').doc('game');

            await ref.update({
                extensions: FieldValue.arrayRemove(extension.substring(0, 1).toUpperCase() + extension.substring(1, extension.length).toLowerCase())
            });     

            if(end === true) {
                const setup = await getSetup();
                const game = await getGameByID(global.game ?? "---");
                
                await disabling.onEnd(global, setup, game);
            }

            if(interaction.type == 'text') {
                await interaction.message.react("✅");
            } else {
                await interaction.reply({ content: "Extension disabled.", ephemeral: true })
            }
        }
    }
}