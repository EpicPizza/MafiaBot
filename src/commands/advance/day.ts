import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { deleteCollection, getGameByID, getGlobal, lockGame, setupPlayer } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, getUserByName, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";
import { FieldValue } from "firebase-admin/firestore";

export const ClearCommand = {
    name: "clear",
    description: "?adv clear {day}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("clear")
            .setDescription("Clear a day's stats, votes, and stored players.")
            .addNumberOption(option =>
                option
                    .setName("day")
                    .setDescription("Which day to clear.")
                    .setRequired(true)
            ),
        text: {
            required: [ z.coerce.number() ],
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

        const day = interaction.type == 'text' ? interaction.arguments[1] as number : interaction.options.getNumber("day");

        if(day == null) throw new Error("Day not specified.");

        const db = firebaseAdmin.getFirestore();

        const dayDoc = db.collection('day').doc((day).toString());

        await deleteCollection(db, dayDoc.collection('votes'), 20);
        await deleteCollection(db, dayDoc.collection('players'), 20);
        await dayDoc.delete();
        
        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Day cleared."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
}

export const DayCommand = {
    name: "set",
    description: "?adv set {number} {players: true|false}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("set")
            .setDescription("Set the day in the database.")
            .addNumberOption(option =>
                option
                    .setName("day")
                    .setDescription("Which day to set it to.")
                    .setRequired(true)
            )
            .addBooleanOption(option =>
                option
                    .setName("players")
                    .setDescription("Whether or not to (re)track players.")
                    .setRequired(false)
            ),
        text: {
            required: [ z.coerce.number() ],
            optional: [ z.coerce.boolean() ]
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

        const players = interaction.type == 'text' ? interaction.arguments.length == 2 ? false : interaction.arguments[2] as boolean : interaction.options.getBoolean('players') ?? false;
        const day = interaction.type == 'text' ? interaction.arguments[1] as number : interaction.options.getNumber("day");

        if(day == null) throw new Error("Day not specified.");

        const db = firebaseAdmin.getFirestore();

        await db.collection('settings').doc('game').update({
            day: day,
        });

        if(players) {
            await db.collection('day').doc((day).toString()).set({
                game: global.game,
                players: global.players.map((player) => player.id),
            });
        }
        
        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Day set."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
}