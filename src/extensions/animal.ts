import { Message } from "discord.js";
import { defaultVote, flow, handleHammer, TransactionResult, Vote } from "../utils/vote";
import { Command, CommandOptions, removeReactions } from "../discord";
import { getGameByID, getGlobal, Global } from "../utils/main";
import { set, z } from "zod";
import { Extension, ExtensionInteraction, getEnabledExtensions } from "../utils/extensions";
import { getUsersArray, User } from "../utils/user";
import { firebaseAdmin } from "../firebase";
import { getSetup } from "../utils/setup";
import { randomInt } from "crypto";

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
        },
        {
            name: "control",
            to: "control",
        }
    ],
    commands: [
        {
            name: "avalanche",
            arguments: {
                optional: [ z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100) ]
            }
        },
        {
            name: "control",
            arguments: {
                optional: [ z.string().min(1).max(100) ],
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

        await ref.doc('control').set({
            id: null,
            control: null,
        });

        await ref.doc('bites').set({
            ids: [],
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
        
        if(command.name == "control") {
            if(global.locked || !global.started) return;

            const ref = db.collection('animal').doc('control');
            const data = (await ref.get()).data();
            const settings = data == undefined ? undefined : data as { id: null | string, control: null | string };

            if(!('parent' in command.message.channel) || command.message.channel.parentId != setup.secondary.dms.id) return;
            if(settings == undefined) throw new Error("Setup incomplete!");
            if(settings.id == null || settings.control == null) return;
            if(settings.id != command.user.id) return;

            await command.message.react("<a:loading:1256150236112621578>");

            const users = await getUsersArray(game.signups);

            const author = command.message.author;
            const voter = users.find(user => user.id == author.id);
            const voting = command.arguments.length > 0 ? users.find(user => user.nickname.toLowerCase() == (command.arguments[0] as string).toLowerCase()) : undefined;

            const extensions = await getEnabledExtensions(global);
            const extension = extensions.find(extension => extension.priority.includes("onVote"));

            const type = command.arguments.length > 0 ? "vote" : "unvote";

            if(type == 'vote' && voting == undefined) throw new Error("Player not found");
            if(voter == undefined) throw new Error("You're not in this game?");

            const result = await db.runTransaction(async t => {
                let result: undefined | TransactionResult = undefined;

                if(extension) result = await extension.onVote(global, setup, game, voter, voting, type, users, t) ?? undefined;

                if(result == undefined) result = await defaultVote(global, setup, game, voter, voting, type, users, t);

                return result;
            }) satisfies TransactionResult;

            await removeReactions(command.message);
            await command.message.react(result.reply.emoji);

            const message = await setup.primary.chat.send({ content: result.reply.typed });
            if(result.setMessage) await result.setMessage(message.id);

            await handleHammer(result.hammer, global, setup, game);
        } else if(command.name == "avalanche") {
            if(global.locked || !global.started) return;

            const ref = db.collection('animal').doc('avalanche');
            const data = (await ref.get()).data();
            const settings = data == undefined ? undefined : data as { id: null | string, used: boolean };

            if(!('parent' in command.message.channel) || command.message.channel.parentId != setup.secondary.dms.id) return;
            if(settings == undefined || settings.id == null) throw new Error("Setup incomplete!");
            if(settings.id != command.user.id) return;

            await command.message.react("<a:loading:1256150236112621578>");

            const extensions = await getEnabledExtensions(global);
            const extension = extensions.find(extension => extension.priority.includes("onVote"));

            if(settings.used) throw new Error("Already used!");
            
            const users = await getUsersArray(game.signups);

            let voting = undefined as undefined | User;
            let voterOne = undefined as undefined | User;
            let voterTwo = undefined as undefined | User;
            let voterThree = undefined as undefined | User;

            try {
                voting = users.find(user => user.nickname.toLowerCase() == (command.arguments[0] as string).toLowerCase());
                voterOne = users.find(user => user.nickname.toLowerCase() == (command.arguments[1] as string).toLowerCase());
                voterTwo = users.find(user => user.nickname.toLowerCase() == (command.arguments[2] as string).toLowerCase());
                voterThree = users.find(user => user.nickname.toLowerCase() == (command.arguments[3] as string).toLowerCase());
            } catch(e) {
                console.log(e);

                throw new Error("Invalid arguments!");
            }

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

        const db = firebaseAdmin.getFirestore();

        const controlRef = db.collection('animal').doc('control');
        const controlData = (await controlRef.get()).data();
        const controlSettings = controlData == undefined ? undefined : controlData as { id: null | string, control: null | string };

        if(controlSettings != undefined && controlSettings.control == voter.id) return {
            reply: {
                typed: "You cannot vote!",
                emoji: process.env.FALSE ?? "⛔",
            },
            hammer: undefined,
            setMessage: async (id: string) => {},
        } satisfies TransactionResult;

        const biteRef = db.collection('animal').doc('bites');
        const biteData = (await biteRef.get()).data();
        const biteSettings = biteData == undefined ? undefined : biteData as { ids: string[] };

        if(biteSettings != undefined && biteSettings.ids.includes(voter.id)) {
            const random = getRandom(1, 2);

            if(random > 1.5) return {
                reply: {
                    typed: "You cannot vote!",
                    emoji: process.env.FALSE ?? "⛔",
                },
                hammer: undefined,
                setMessage: async (id: string) => {},
            } satisfies TransactionResult;
        }

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

function getRandom(min: number | undefined, max: number | undefined) {
    if(max == undefined || min == undefined) throw new Error("Range must be set!");

    return randomInt(min, max + 1);
}