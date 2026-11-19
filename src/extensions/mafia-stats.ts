import { Command } from "commander";
import { z } from "zod";
import { fromZod } from '../utils/text';
import { Extension } from "../utils/extensions";
import { flow } from "../utils/mafia/vote";
import { Event, TextCommand } from "../discord";
import { firebaseAdmin } from "../utils/firebase";
import { getGameByID, getGameSetup } from "../utils/mafia/games";
import { StatsAction, TrackedMessage } from "../utils/mafia/tracking";
import { EmbedBuilder } from "@discordjs/builders";
import { Colors } from "discord.js";
import { channelOf, findRunningGame } from "../utils/mafia/context";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

module.exports = {
    name: "Mafia Stats",
    emoji: "📊",
    commandName: "mafia",
    description: "Tracks mafia stats throughout the game.",
    priority: [], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: "?mafia",
    commands: [
        () => {
            return new Command()
                .name('stats')
                .description('Show stats of mafia chat.')
        }
    ],
    interactions: [],
    onStart: async (ctx) => {
        const { instance, game } = ctx;

        /**
         * Runs during game start processes.
         */

        console.log("Extension Start");

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (ctx) => {
        const { instance, game } = ctx;

        /**
         * Runs after game has locked.
         */

        console.log("Extension Lock");
    },
    onUnlock: async (ctx, incremented) => {
        const { instance, game } = ctx;

        /**
         * Runa after game has unlocked.
         * 
         * incremented: boolean - Whether day has advanced or not.
         */

        console.log("Extension Unlock", incremented);

        return;

        /**
         * Nothing to return.
         */
    },
    onCommand: async (command: Event<TextCommand>) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        command.inInstance();

        if(command.name != "stats" || command.message.guildId != command.instance.setup.tertiary.guild.id) return;
        const ctx = await findRunningGame(command.instance, channelOf(command));
        if(ctx == undefined) return;

        const instance = command.instance;
        const db = firebaseAdmin.getFirestore();

        const doc = db.collection('instances').doc(instance.id).collection('mafia-stats').doc('tracking');
        const data = (await doc.get()).data();

        const timestamp = data?.timestamp as number | undefined ?? 0;
        const statsActions = data?.stats as StatsAction[] ?? [];

        const gameSetup = ctx.gameSetup;

        const messages = (await db.collection('channels').doc(gameSetup.mafia.id).collection('messages').orderBy('createdTimestamp').startAfter(timestamp).get()).docs.map(doc => doc.data() as TrackedMessage);
        const appendStats = messages.map(message => {
            return {
                messages: 1,
                words: message.content.split(" ").length,
                id: message.authorId,
                day: 0,
                instance: instance.id,
                type: 'add',
                game: ctx.game.id,
                images: 0
            } satisfies StatsAction;
        });

        const reconciledStats = reconcileStats([...statsActions, ...appendStats]);

        reconciledStats.sort((a, b) => b.messages - a.messages);
        
        const message = reconciledStats.reduce((previous, current) => previous += "<@" + current.id + "> » " + current.messages + " message" + (current.messages== 1 ? "" : "s") + " containing " + current.words + " word" + (current.words== 1 ? "" : "s") + "\n", "");

        const embed = new EmbedBuilder()
            .setTitle("Mafia Stats")
            .setColor(Colors.Red)
            .setDescription(message);

        await command.reply({ embeds: [embed] });

        await doc.set({
            timestamp: messages[messages.length - 1].createdTimestamp,
            stats: reconciledStats,
        }, { merge: true });
        
        return;

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction) => {
        /**
         * Interactions for buttons, modals, and select menus. Context menu and slash commands not implemented.
         * 
         *  interaction: {
         *      customId: any,
         *      name: string,
         *      interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction
         *  }
         */

        console.log(extensionInteraction);

        return;
    },
    onMessage: async (message) => {
        /*
         * Keep fetches to a minimum, these can add up. For this reason, only cache is given, only use helper functions when necessary.
         * 
         * cache: { day: number, started: boolean, channel: null | TextChannel } - TextChannel may or may not be fetched depending if bot has fully intialized
         */

        //console.log("Extension", message);

        return;

        /**
         * Nothing to return.
         */
    },
    onEnd: async (ctx) => {
        const { instance, game } = ctx;

        /**
         * Runs during game end processes.
         */

        console.log("Extension End");

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (ctx, voter, voting, type, users, transaction) => {
        const { instance, game } = ctx;

        /**
         * Control the entire voting logic. This example shows the default voting behavior.
         * 
         * This runs within a database transaction, reading with the transaction blocks other writes, only read with transaction as necessary. Use users or fallback to normal reads.
         */

        const { reply, vote, votes } = await flow.placeVote(transaction, voter, voting, type, users, ctx.state.day, game, instance); // doesn't save vote yet since board needs to be created
        
        if(vote == undefined) return { reply };

        const board = flow.board(votes, users);

        const setMessage = flow.finish(transaction, vote, board, ctx.state.day, game, instance); // locks in vote

        return {
            reply,
            hammer: flow.determineHammer(vote, votes, users, ctx.state),
            setMessage,
        }

        /**
         * reply: { typed: string, emoji: string } - What gets replied to the user. Typed for slash/context/etc commands, emoji for text commands.
         * hammer?: { message: string, hammered: boolean, id: string } 
         * setMessage?: (id: string) => Promise<void> - Setting the id of the message to keep in logs.
         */
    },
    onVotes: async (ctx, board ) => {
        const { instance, game } = ctx;
 
        return "Example footer.";

        /**
         * Return what is show in the footer in ?votes.
         */
    },
    onHammer: async (ctx, hammered) => {},
    onRemove: async (ctx, removed) => {},
    onDump: async (statsBatch, messageBatch, reactionBatch) => {},
} satisfies Extension;

function reconcileStats(statsEntries: StatsAction[]) {
    const compressed = [] as StatsAction[];

    for(let i = 0; i < statsEntries.length; i++) {
        const entry = statsEntries[i];
        const existing = compressed.find(e => e.day == entry.day && e.game == entry.game && e.id == entry.id);

        console.log("existing found", existing, entry);

        if(existing) {
            existing.messages += entry.messages;
            existing.words += entry.words;
            existing.images += entry.images;
        } else {
            compressed.push({ ...entry });
        }
    }

    return compressed;
}