import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal } from '../../utils/global';
import { getGameByID } from "../../utils/mafia/games";
import { deleteCollection } from "../../utils/mafia/main";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const ClearCommand = {
    name: "clear",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("clear")
        .setDescription("Clear a day's stats, votes, and stored players.")
        .addNumberOption(option =>
            option
                .setName("day")
                .setDescription("Which day to clear.")
                .setRequired(true)
        ),
    text: () => {
        return new Command()
            .name('clear')
            .description('Clear stats, votes, and tracked players from selected day. To retrack players, use /advance set or ?adv set on the same day with players true.')
            .argument('<day>', 'which day to clear', fromZod(z.coerce.number()));
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

        const day = interaction.type == 'text' ? interaction.program.processedArgs[0] as number : interaction.options.getNumber("day");

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
} satisfies Subcommand;

export const DayCommand = {
    name: "set",
    subcommand: true,

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
    text: () => {
        return new Command()
            .name('set')
            .description('Set the current day. Setting players to true will retrack the current players on the selected day.')
            .argument('<day>', 'which day', fromZod(z.coerce.number()))
            .option('-p, --players', 'whether to or not (re)track players')
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

        const players = interaction.type == 'text' ? interaction.program.getOptionValue('players') === true : interaction.options.getBoolean('players') ?? false;
        const day = interaction.type == 'text' ? interaction.program.processedArgs[0] as number : interaction.options.getNumber("day");

        if(day == null) throw new Error("Day not specified.");

        const db = firebaseAdmin.getFirestore();

        await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('game').update({
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