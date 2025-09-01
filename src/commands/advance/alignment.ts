import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { getEnabledExtensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal, type Global } from '../../utils/global';
import { getGameByID, getGameSetup, Signups } from "../../utils/mafia/games";
import { getUser, User } from "../../utils/mafia/user";
import { getSetup, Setup, } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";
import { setAlignments } from "../mod/start";

export const AlignmentCommand = {
    name: "alignment",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("alignment")
        .setDescription("Set a players alignment midgame.")
        .addStringOption(option =>
            option
                .setName("player")
                .setDescription("Which player to set alignment to.")
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option
                .setName("alignment")
                .setDescription("What alignment to set to.")
                .setRequired(true)),
    text: () => {
        return new Command()
            .name('alignment')
            .description('set a player\'s alignment midgame')
            .argument('<player>', 'nickname of player', fromZod(z.string().min(1).max(100)))
            .argument('<alignment>', 'alignment to set', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();
        
        if(global.started == false) throw new Error("Game has not started.");

        const game = await getGameByID(global.game ?? "");
         const gameSetup = await getGameSetup(game, setup);

        const player = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');
        const alignment = interaction.type == 'text' ? interaction.program.processedArgs[1] as string : interaction.options.getString('alignment');

        if(player == null) throw new Error("Choose a player.");
        if(alignment == null || alignment == "") throw new Error("Alignment must be specified.");

        const list = [] as User[];
        
        for(let i = 0; i < global.players.length; i++) {
            const user = await getUser(global.players[i].id);

            if(user == null) throw new Error("User not registered.");

            list.push(user);
        }

        const user = list.find(user => user.nickname.toLowerCase() == player.toLowerCase());

        if(!user) throw new Error("Player not found.");

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = await getGlobal(t);

            for(let i = 0; i < global.players.length; i++) {
                if(global.players[i].id == user.id) {
                    global.players[i].alignment = alignment == "null" || alignment == "default" ? null : alignment;
                }
            }

            t.update(ref, {
                players: global.players
            });
        });
        
        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Alignment set."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;

export const InitialCommand = {
    name: "initial",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("initial")
        .setDescription("Resend alignment picker."),
    text: () => {
        return new Command()
            .name('initial')
            .description('resend alignment picker');
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply();
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        await setAlignments();

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Message sent."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;


async function hammerExtensions(global: Global, setup: Setup, game: Signups, hammered: string) {
    const extensions = await getEnabledExtensions(global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onHammer(global, setup, game, hammered)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}