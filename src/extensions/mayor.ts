import { ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder, Message } from "discord.js";
import { CustomLog, flow, getVotes, handleHammer, TransactionResult, Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getGameByID, getGlobal } from "../utils/main";
import { z } from "zod";
import { firebaseAdmin } from "../firebase";
import { Setup, getSetup } from "../utils/setup";
import { Signups, getGameSetup } from "../utils/games";
import { Global } from "../utils/main"
import { User, getUser, getUserByChannel, getUserByName, getUsers, getUsersArray } from "../utils/user";
import { checkMod } from "../utils/mod";
import { Extension, ExtensionInteraction } from "../utils/extensions";
import { Transaction } from "firebase-admin/firestore";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `This extension can support mayor in three different ways: hidden, secret, or classic. 
- hidden - The mayor is always kept hidden with their extra votes always counted. 
- secret - Works similarly to hidden, except the mayor has the ability to reveal that they are mayor. 
- classic - Their extra votes are not counted until they reveal that they are mayor.
- public - Their extra votes are immediently counted without having to reveal.

⚠️ WARNING: Only ?reveal will recalculate hammer, a person may need to revote to count their new votes after being set mayor.

**?mayor set {type} {weight} {day}** Type indicates the mayor behavior: hidden, secret or classic. Weight is how many votes the mayor will count for, minimum 1 and whole numbers only. Must be run by the mod, inside the dm that is mayor.

**?mayor clear** Clear the current set mayor of a player. Must be run by the mod, inside the corresponding dm.

**?mayor check** List out all the mayors set. Must be run in dead chat channel.

**?mayor votes** Show votes with hidden mayors. Must be run in dead chat channel.

**?reveal** Command used by player to reveal they are mayor.`

module.exports = {
    name: "Mayors",
    emoji: "🗳️",
    commandName: "mayor",
    description: "Includes mayors and similar roles in games.",
    priority: [ "onVote", "onVotes" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    shorthands: [
        {
            name: "reveal",
            to: "reveal",
        }
    ],
    commands: [
        {
            name: "set",
            arguments: {
                required: [ z.literal("hidden").or(z.literal("secret")).or(z.literal("classic")).or(z.literal('public')), z.coerce.number().int().min(1), z.coerce.number().int().min(1) ],
            }
        }, {
            name: "clear",
            arguments: {},
        }, {
            name: "check",
            arguments: {},
        }, {
            name: "reveal",
            arguments: {},
        }, {
            name: "votes",
            arguments: {},
        }
    ] satisfies CommandOptions[],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('mayor'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {},
    onUnlock: async (global, setup, game, incremented) => {},
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const setup = await getSetup();
        const global = await getGlobal();
        const member = await setup.primary.guild.members.fetch(command.user.id);
        const game = await getGameByID(global.game ?? "");

        if(command.name == "set") {
            await checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

            const user = await getUserByChannel(command.message.channel.id);
            if(!user) throw new Error("This dm channel is not linked to a user.");

            const db = firebaseAdmin.getFirestore();
            const ref = db.collection('mayor').doc(user.id);

            const previous = (await ref.get()).data() as MayorEntry | undefined;
            const newEntry = {
                type: command.arguments[0] as 'public' | 'classic' | 'secret' | 'hidden',
                weight: command.arguments[1] as number,
                reveal: command.arguments[0] == 'public' ? true : false,
                day: command.arguments[2] as number,
            } satisfies MayorEntry;
            
            await ref.set(newEntry);

            if(newEntry.type == "public") {
                await updateVotes(newEntry.day, game, "is now a mayor!", user.id); //update if new entry has votes that count immediently.
            } else if(previous && previous.reveal == true) {
                await updateVotes(newEntry.day, game, "is no longer a mayor!", user.id); //update if new entry doesn't have votes that count immediently.
            }

            //no need to do anything if nothing changes visibly with mayor

            await command.message.react("✅");
        } else if(command.name == "clear") {
            await checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

            const user = await getUserByChannel(command.message.channel.id);
            if(!user) throw new Error("This dm channel is not linked to a user.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('mayor').doc(user.id);
            const previous = (await ref.get()).data() as MayorEntry | undefined;
            await ref.delete();

            if(previous?.reveal == true) {
                await updateVotes(previous.day, game, "is no longer a mayor!", user.id);
            }

            await command.message.react("✅");
        } else if(command.name == "check") {
            const gameSetup = await getGameSetup(game, setup);

            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != gameSetup.spec.guildId || command.message.channel.id != gameSetup.spec.id) throw new Error("This command must be run in dead chat.");

            const mayors = await getMayors(await getUsersArray(game.signups));

            let message = mayors.reduce((prev, mayor) => prev + (mayor.nickname ?? "<@" + mayor.id + ">") + " - " + capitalize(mayor.type) + " (Weight: " + mayor.weight + ") (Day: " + mayor.day + ")\n", "");

            const embed = new EmbedBuilder()
                .setTitle("Mayor List")
                .setColor(Colors.NotQuiteBlack)
                .setDescription(message == "" ? "No Mayors" : message);

            await command.message.reply({ embeds: [embed] });
        } else if(command.name == "reveal") {
            if(command.message.channelId != setup.primary.chat.id) throw new Error("Must be in main chat!");
            if(global.locked == true) throw new Error("Game is locked!");

            const result = await reveal(command.user.id, global, game);

            if(result == undefined) return;

            await result.setMessage(command.message.id);

            await command.message.react("✅");

            await handleHammer(result.hammer, global, setup, game);
        } else if(command.name == "votes") {
            await checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            const gameSetup = await getGameSetup(game, setup);
            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != gameSetup.spec.guildId || command.message.channel.id != gameSetup.spec.id) throw new Error("This command must be run in dead chat.");

            const votes = await getVotes(global.day);
            const users = await getUsersArray(game.signups);
            const mayors = await getMayors();

            const board = getBoard(votes, users, mayors, global.day, true);

            const embed = new EmbedBuilder()
                .setTitle("Votes » Today (Day " + global.day + ")")
                .setColor(Colors.Gold)
                .setDescription(board);

            await command.reply({ embeds: [embed] });
        }

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message, cache) => {},
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
        const { reply, vote, votes } = await flow.placeVote(transaction, voter, voting, type, users, global.day); // doesn't save vote yet since board needs to be created
        
        if(vote == undefined) return { reply };

        const mayors = await getMayors();

        const board = getBoard(votes, users, mayors, global.day);

        const setMessage = flow.finish(transaction, vote, board, global.day); // locks in vote

        return {
            reply,
            hammer: determineHammer(vote, votes, users, mayors, global.day),
            setMessage,
        }
    },
    onVotes: async (global, setup, game, board ) => { return ""; }, // no need to change from default behavior
    onHammer: async (global, setup, game, hammered) => {},
    onRemove: async (global, setup, game, removed) => {}
} satisfies Extension;

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
}

interface MayorEntry {
    type: 'public' | 'classic' | 'secret' | 'hidden',
    weight: number,
    reveal: boolean,
    day: number,
}

interface Mayor extends MayorEntry {
    id: string,
    nickname?: string,
}

async function getMayors(users: User[] | undefined = undefined, transaction: Transaction | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    const docs = transaction ? (await transaction.get(db.collection('mayor'))).docs : (await db.collection('mayor').get()).docs;

    const mayors = new Array<Mayor>();

    for(let i = 0; i < docs.length; i++) {
        const user = users ? users.find(user => user.id == docs[i].id) : undefined;

        mayors.push({
            nickname: user?.nickname,
            id: docs[i].id,
            reveal: docs[i].data().reveal,
            type: docs[i].data().type,
            weight: docs[i].data().weight,
            day: docs[i].data().day,
        });
    }

    return mayors;
}

function getBoard(votes: Vote[], users: User[], mayors: Awaited<ReturnType<typeof getMayors>>, day: number, deadChat: boolean = false,): string {
    const counting = [] as { voting: string, count: number, voters: string[]}[];

    const all = [...new Set(votes.map(vote => vote.for))];

    all.forEach(votingId => {
        const voting = users.find(user => user.id == votingId)?.nickname ?? "<@" + votingId + ">";

        let count = 0;

        const voters = votes.filter(vote => vote.for == votingId).sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf()).map(vote => {
            const mayor = mayors.find(mayor => mayor.id == vote.id && mayor.day == day);

            if(mayor && (((mayor.type != 'hidden') && mayor.reveal == true) || (deadChat && ((mayor.type != "classic" && mayor.type != "public") || ((mayor.type == "classic" || mayor.type == "public") && mayor.reveal == true))))) {
                count += mayor.weight;
            } else {
                count++;
            }

            const indicator = (() => {
                if(!mayor) {
                    return ""
                } else if((mayor.type == "classic" || mayor.type == "public" || mayor.type == "secret") && mayor.reveal == true) {
                    return " (" + mayor.weight + ")"
                } else if(deadChat && (mayor.type == "hidden" || (mayor.type == "secret" && mayor.reveal == false))) {
                    return " ~~(" + mayor.weight + ")~~"
                } else if(deadChat && mayor.type == "classic" && mayor.reveal == false) {
                    return " *(" + mayor.weight + ")*";
                } else {
                    return "";
                }

            })();

            return (users.find(user => user.id == vote.id)?.nickname ?? "<@" + vote + ">") + indicator;
        });


        counting.push({
            voting,
            count,
            voters
        });
    });

    counting.sort((a, b) => b.voters.length - a.voters.length);

    const board = counting.reduce((prev, curr) => prev += (curr.count + " - " + curr.voting + " « " + curr.voters.join(", ")) + "\n", "");

    return board;
}

function determineHammer(vote: Vote, votes: Vote[], users: User[], mayors: Awaited<ReturnType<typeof getMayors>>, day: number): TransactionResult["hammer"] {
    if(vote.for == 'unvote') return { hammered: false, message: null, id: null };

    console.log(votes);
    console.log(mayors);

    let votesForHammer = votes.filter(v => v.for == vote.for).reduce((prev, vote) => {
        const mayor = mayors.find(mayor => mayor.id == vote.id && mayor.day == day);

        if(mayor && (mayor.type != "classic" || (mayor.type == "classic" && mayor.reveal == true))) {
            return prev + mayor.weight;
        } else {
            return prev + 1;
        }
    }, 0);

    const half = Math.floor(users.length / 2);

    console.log("HALF", half);
    console.log("VOTES", votesForHammer);

    if(votesForHammer > half) {
        return { hammered: true, message: (users.find(user => user.id == vote.for)?.nickname ?? "<@" + vote.for + ">") + " has been hammered!", id: vote.for };
    } else {
        return { hammered: false, message: null, id: null };
    }
}

async function updateVotes(day: number, game: Signups, message: string, id: string) {
    const db = firebaseAdmin.getFirestore();

    const users = await getUsersArray(game.signups);

    await db.runTransaction(async t => {
        const votes = await getVotes(day, t);

        const mayors = await getMayors(users, t);

        const board = getBoard(votes, users, mayors, day);

        const ref = db.collection('day').doc(day.toString()).collection('votes').doc();

        t.create(ref, {
            board,
            search: {
                name: users.find(user => user.id == id)?.nickname ?? "<@" + id + ">",
            },
            prefix: true,
            message: message,
            messageId: null,
            type: 'custom',
            timestamp: new Date().valueOf(),
        } satisfies CustomLog);
    })
}

async function reveal(id: string, global: Global, game: Signups) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('mayor').doc(id);

    const users = await getUsersArray(game.signups);

    const result = await db.runTransaction(async t => {
        const votes = await getVotes(global.day, t); // no need to actually put a vote, just retrieve votes

        const data = (await t.get(ref)).data();
        if(!data || !(data.type == 'secret' || data.type == 'classic') || data.reveal == true) return; //check they are a mayor

        const mayors = await getMayors(users, t);

        t.update(ref, {
            reveal: true,
        });

        const index = mayors.findIndex(mayor => mayor.id == id);
        if(index > -1) mayors[index].reveal = true; //update the mayor to revealed so we don't need to refetch (we can't refetch)

        const board = getBoard(votes, users, mayors, global.day);
        
        const logRef = db.collection('day').doc(global.day.toString()).collection('votes').doc();

        const existing = votes.find(v => v.id == id);
        
        t.create(logRef, {
            board,
            search: {
                name: users.find(user => user.id == id)?.nickname ?? "<@" + id + ">",
                ...(existing ? {
                    for: users.find(user => user.id == existing.for)?.nickname ?? "<@" + existing.for + ">",
                } : {})
            },
            prefix: true,
            message: "has revealed they are a mayor!",
            messageId: null,
            type: 'custom',
            timestamp: new Date().valueOf(),
        } satisfies CustomLog); // use a custom log since not a real vote

        const setMessage = async (id: string) => {
            await logRef.update({
                messageId: id,
            });
        };

        return {
            hammer: existing ? determineHammer(existing, votes, users, mayors, global.day) : { hammered: false as false, message: null, id: null },
            setMessage
        }
    });

    return result;
}