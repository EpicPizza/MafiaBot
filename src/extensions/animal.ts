import { Message } from "discord.js";
import { defaultVote, flow, handleHammer, TransactionResult, Vote } from "../utils/vote";
import { Command, CommandOptions, removeReactions } from "../discord";
import { getGameByID, getGlobal, Global } from "../utils/main";
import { set, z } from "zod";
import { Extension, ExtensionInteraction, getEnabledExtensions } from "../utils/extensions";
import { getUsersArray, User } from "../utils/user";
import { firebaseAdmin } from "../firebase";
import { getSetup } from "../utils/setup";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

module.exports = {
    name: "Animal",
    emoji: "🐼",
    commandName: "animal",
    description: "Game specific extension.",
    priority: [ "onVote", "onVotes" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: "nuh uh, you really thought i was going to put something here",
    shorthands: [
        {
            name: "avalanche",
            to: "avalanche",
        }
    ],
    commands: [
        {
            name: "avalanche",
            arguments: {
                required: [ z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100) ]
            }
        }
    ] satisfies CommandOptions[],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('animal');

        await ref.doc('hated').set({
            id: null,
        });

        await ref.doc('avalanche').set({
            id: null,
            used: false,
        });

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {
        /**
         * Runs after game has locked.
         */

        console.log("Extension Lock");
    },
    onUnlock: async (global, setup, game, incremented) => {
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
    onCommand: async (command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const global = await getGlobal();
        const setup = await getSetup();
        const game = await getGameByID(global.game ?? "");

        const db = firebaseAdmin.getFirestore();
        
        if(command.name == "avalanche") {
            const ref = db.collection('animal').doc('avalanche');
            const data = (await ref.get()).data();
            const settings = data == undefined ? undefined : data as { id: null | string, used: boolean };

            if(settings == undefined || settings.id == null) throw new Error("Setup incomplete!");
            if(settings.id != command.user.id) return;

            await command.message.react("<a:loading:1256150236112621578>");

            const extensions = await getEnabledExtensions(global);
            const extension = extensions.find(extension => extension.priority.includes("onVote"));

            if(settings.used) throw new Error("Already used!");
            
            const users = await getUsersArray(game.signups);

            const voting = users.find(user => user.nickname.toLowerCase() == (command.arguments[0] as string).toLowerCase());
            const voterOne = users.find(user => user.nickname.toLowerCase() == (command.arguments[1] as string).toLowerCase());
            const voterTwo = users.find(user => user.nickname.toLowerCase() == (command.arguments[2] as string).toLowerCase());
            const voterThree = users.find(user => user.nickname.toLowerCase() == (command.arguments[3] as string).toLowerCase());

            if(voting == undefined) throw new Error("Who to vote player not found!");
            if(voterOne == undefined) throw new Error("Voter 1 player not found!");
            if(voterTwo == undefined) throw new Error("Voter 2 player not found!");
            if(voterThree == undefined) throw new Error("Voter 3 player not found!");

            const resultOne = await db.runTransaction(async t => {
                let result: undefined | TransactionResult = undefined;

                if(extension) result = await extension.onVote(global, setup, game, voterOne, voting, "vote", users, t) ?? undefined;
    
                if(result == undefined) result = await defaultVote(global, setup, game, voterOne, voting, "vote", users, t);
    
                return result;
            }) satisfies TransactionResult;

            const resultTwo = await db.runTransaction(async t => {
                let result: undefined | TransactionResult = undefined;

                 if(extension) result = await extension.onVote(global, setup, game, voterTwo, voting, "vote", users, t) ?? undefined;
    
                if(result == undefined) result = await defaultVote(global, setup, game, voterTwo, voting, "vote", users, t);
    
                return result;
            }) satisfies TransactionResult;

            const resultThree = await db.runTransaction(async t => {
                let result: undefined | TransactionResult = undefined;

                 if(extension) result = await extension.onVote(global, setup, game, voterThree, voting, "vote", users, t) ?? undefined;
    
                if(result == undefined) result = await defaultVote(global, setup, game, voterThree, voting, "vote", users, t);
    
                return result;
            }) satisfies TransactionResult;

            const messageOne = await setup.primary.chat.send({ content: resultOne.reply.typed });
            if(resultOne.setMessage) await resultOne.setMessage(messageOne.id);

            const messageTwo = await setup.primary.chat.send({ content: resultTwo.reply.typed });
            if(resultTwo.setMessage) await resultTwo.setMessage(messageTwo.id);

            const messageThree = await setup.primary.chat.send({ content: resultThree.reply.typed });
            if(resultThree.setMessage) await resultThree.setMessage(messageThree.id);

            await handleHammer(resultThree.hammer, global, setup, game);

            await ref.update({ used: true });

            await removeReactions(command.message);
            await command.message.react('✅');
        }

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
    onMessage: async (message, cache) => {
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
    onEnd: async (global, setup, game) => {
        /**
         * Runs during game end processes.
         */

        console.log("Extension End");

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {
        /**
         * Control the entire voting logic. This example shows the default voting behavior.
         * 
         * This runs within a database transaction, reading with the transaction blocks other writes, only read with transaction as necessary. Use users or fallback to normal reads.
         */

        const { reply, vote, votes } = await flow.placeVote(transaction, voter, voting, type, users, global.day); // doesn't save vote yet since board needs to be created
        
        if(vote == undefined) return { reply };

        const board = flow.board(votes, users);

        const setMessage = flow.finish(transaction, vote, board, global.day); // locks in vote

        return {
            reply,
            hammer: await determineHammer(vote, votes, users, global),
            setMessage,
        }

        /**
         * reply: { typed: string, emoji: string } - What gets replied to the user. Typed for slash/context/etc commands, emoji for text commands.
         * hammer?: { message: string, hammered: boolean, id: string } 
         * setMessage?: (id: string) => Promise<void> - Setting the id of the message to keep in logs.
         */
    },
    onVotes: async (global, setup, game, board ) => { 
        return "";

        /**
         * Return what is show in the footer in ?votes.
         */
    },
    onHammer: async (global, setup, game, hammered) => {},
    onRemove: async (global, setup, game, removed) => {}
} satisfies Extension;

async function determineHammer(vote: Vote, votes: Vote[], users: User[], global: Global): Promise<TransactionResult["hammer"]> {
    if(vote.for == 'unvote' || global.hammer == false) return { hammered: false, message: null, id: null };

    let votesForHammer = votes.filter(v => v.for == vote.for);
    const hammerThreshold = parseInt(process.env.HAMMER_THRESHOLD_PLAYERS ?? '-1');
    let half = hammerThreshold === -1 ? Math.floor(global.players.length / 2) : Math.floor(hammerThreshold / 2);

    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('animal').doc('hated');
    const id = ((await ref.get()).data()?.id ?? null) as null | string;

    console.log(vote.for, id);

    if(vote.for == id) half = Math.floor((global.players.length * 0.75) / 2);

    console.log(half);

    if(votesForHammer.length > half && global.hammer) {
        return {
            message: (users.find(user => vote.for == user.id)?.nickname ?? "<@" + vote.for + ">") + " has been hammered!",
            hammered: true as true,
            id: vote.for
        }
    } else {
        return {
            message: null,
            hammered: false as false,
            id: null
        }
    }
}