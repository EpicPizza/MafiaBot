import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandGroupBuilder } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { getAllExtensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal } from '../../utils/global';
import { getGameByID } from "../../utils/mafia/games";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const ExtensionCommand = {
    name: "extension",
    //description: "?adv extension {enabled | disable} *{name}* {start/end: true|false}",
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
    text: () => {
        return new Command()
            .name('extension')
            .description('manage extensions')
            .argument('<action>', 'enable, disable', fromZod(z.string().min(1).max(100)))
            .argument('<name>', 'name of extension', fromZod(z.string().min(1).max(100)))
            .option('--setup', 'to run start/end fucntion', fromZod(z.string().min(1).max(100)))
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        const extension = interaction.type == 'text' ? interaction.program.processedArgs[1] as string : interaction.options.getString("extension");
        const command = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getSubcommand();
        const start = interaction.type == 'text' ? interaction.program.getOptionValue('setup') === true : interaction.options.getBoolean("start");
        const end = interaction.type == 'text' ? interaction.program.getOptionValue('setup') === true : interaction.options.getBoolean("end");

        console.log(interaction.type == 'text' ? interaction.program.args : []);
        console.log(start, end);

        if(command == null) throw new Error("Arguments not specified.");
        if(extension == null) throw new Error("Extension name not specified.");

        const enabled = getAllExtensions().filter(extension => global.extensions.find(enabled => enabled == extension.name));
        const disabled = getAllExtensions().filter(extension => !global.extensions.find(enabled => enabled == extension.name));

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
} satisfies Subcommand;