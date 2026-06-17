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
    onStart: async (instance, game) => {
        /**
         * Runs during game start processes.
         */

        console.log("Extension Start");

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (instance, game) => {
        /**
         * Runs after game has locked.
         */

        console.log("Extension Lock");
    },
    onUnlock: async (instance, game, incremented) => {
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
        if(command.instance.global.started == false) return;

        const instance = command.instance;
        const db = firebaseAdmin.getFirestore();

        const doc = db.collection('instances').doc(instance.id).collection('mafia-stats').doc('tracking');
        const data = (await doc.get()).data();

        const timestamp = data?.timestamp as number | undefined ?? 0;
        const statsActions = data?.stats as StatsAction[] ?? [];

        const gameSetup = await getGameSetup(await getGameByID(instance.global.game ?? "---", instance), instance.setup);

        const messages = (await db.collection('channels').doc(gameSetup.mafia.id).collection('messages').orderBy('createdTimestamp').startAfter(timestamp).get()).docs.map(doc => doc.data() as TrackedMessage);
        const appendStats = messages.map(message => {
            return {
                messages: 1,
                words: message.content.split(" ").length,
                id: message.authorId,
                day: 0,
                instance: instance.id,
                type: 'add',
                game: instance.global.game ?? "---",
                images: 0
            } satisfies StatsAction;
        });

        const reconciledStats = reconcileStats([...statsActions, ...appendStats]);
        
        const message = reconciledStats.reduce((previous, current) => previous += "<@" + current.id + "> » " + current.messages + " message" + (current.messages== 1 ? "" : "s") + " containing " + current.words + " word" + (current.words== 1 ? "" : "s") + "\n", "");

        const embed = new EmbedBuilder()
            .setTitle("Mafia Stats")
            .setColor(Colors.Red)
            .setDescription(message);

        await command.reply({ embeds: [embed] });

        await doc.update({
            timestamp: messages[messages.length - 1].createdTimestamp,
            stats: reconciledStats,
        });
        
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
    onEnd: async (instance, game) => {
        /**
         * Runs during game end processes.
         */

        console.log("Extension End");

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (instance, game, voter, voting, type, users, transaction) => {
        /**
         * Control the entire voting logic. This example shows the default voting behavior.
         * 
         * This runs within a database transaction, reading with the transaction blocks other writes, only read with transaction as necessary. Use users or fallback to normal reads.
         */

        const { reply, vote, votes } = await flow.placeVote(transaction, voter, voting, type, users, instance.global.day, game, instance); // doesn't save vote yet since board needs to be created
        
        if(vote == undefined) return { reply };

        const board = flow.board(votes, users);

        const setMessage = flow.finish(transaction, vote, board, instance.global.day, game, instance); // locks in vote

        return {
            reply,
            hammer: flow.determineHammer(vote, votes, users, instance.global),
            setMessage,
        }

        /**
         * reply: { typed: string, emoji: string } - What gets replied to the user. Typed for slash/context/etc commands, emoji for text commands.
         * hammer?: { message: string, hammered: boolean, id: string } 
         * setMessage?: (id: string) => Promise<void> - Setting the id of the message to keep in logs.
         */
    },
    onVotes: async (instance, game, board ) => { 
        return "Example footer.";

        /**
         * Return what is show in the footer in ?votes.
         */
    },
    onHammer: async (instance, game, hammered) => {},
    onRemove: async (instance, game, removed) => {},
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