import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByID, getGlobal, lockGame, setupPlayer } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, getUserByName, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";
import { FieldValue } from "firebase-admin/firestore";



export const AddCommand = {
    name: "add",
    description: "?adv add {nickname}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("add")
            .setDescription("Add a player midgame.")
            .addStringOption(option =>
                option
                    .setName("player")
                    .setDescription("Which player to add.")
                    .setRequired(true)
                    .setAutocomplete(true)),
        text: {
            required: [ z.string() ],
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
}