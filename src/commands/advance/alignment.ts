import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByID, getGlobal, lockGame } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global } from "../../utils/main";
import { addMafiaPlayer } from "../mod/alignments";
import { firebaseAdmin } from "../../firebase";

export const AlignmentCommand = {
    name: "alignment",
    description: "?adv alignment {nickname} {alignment}",
    command: {
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
        text: {
            required: [ z.string(), z.string() ],
            optional: []
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
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

        const player = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('player');
        const alignment = interaction.type == 'text' ? interaction.arguments[2] as string : interaction.options.getString('alignment');

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
}

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