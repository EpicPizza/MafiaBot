import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal } from '../../utils/global';
import { getGameByID, getGameSetup } from "../../utils/mafia/games";
import { setupPlayer } from "../../utils/mafia/main";
import { getUserByName } from "../../utils/mafia/user";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const AddCommand = {
    name: "add",
    subcommand: true,

        slash: new SlashCommandSubcommandBuilder()
            .setName("add")
            .setDescription("Add a player midgame.")
            .addStringOption(option =>
                option
                    .setName("player")
                    .setDescription("Which player to add.")
                    .setRequired(true)
                    .setAutocomplete(true)),
        text: () => {
            return new Command()
                .name('add')
                .description('Add a player midgame. Only requirement is that the player must have set a nickname.')
                .argument('<player>', 'nickname of player', fromZod(z.string().min(1).max(100)));
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

        if(player == null) throw new Error("Choose a player.");

        const user = await getUserByName(player);

        if(!user) throw new Error("Player not found.");

        await setupPlayer(user.id, setup, gameSetup);

        const db = firebaseAdmin.getFirestore();
        await db.collection('settings').doc('game').update({ players: FieldValue.arrayUnion({ id: user.id, alignment: null }) });
        await db.collection('settings').doc('game').collection('games').doc(game.id).update({ signups: FieldValue.arrayUnion(user.id) });

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Player added."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;