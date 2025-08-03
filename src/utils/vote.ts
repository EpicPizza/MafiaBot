import { firebaseAdmin } from "../firebase";
import { ApplicationEmoji, REST, Routes, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { Data } from "../discord";
import { Transaction } from "firebase-admin/firestore";
import { User } from "./user";
import { Signups } from "./games";
import { Setup } from "./setup";
import { Global, lockGame } from "./main";
import { getEnabledExtensions } from "./extensions";

export interface Vote {
    id: string,
    for: string | 'unvote',
    replace?: string,
    timestamp: number,
}

export interface Log {
    vote: Vote,
    board: string,
    messageId: string | null, 
    type: 'standard',
    timestamp: number,
}

export interface CustomLog {
    search: { //for vote history search, add nicknames
        for?: string,
        replace?: string,
        name: string,
    },
    message: string,
    prefix: boolean, //prefix nickname to the beginning of the name
    board: string,
    messageId: string | null,
    type: 'custom'
    timestamp: number,
}

export interface ResetLog {
    message: string,
    board: string,
    messageId: string | null,
    type: 'reset',
    timestamp: number,
}

export interface TransactionResult {
    reply: Awaited<ReturnType<(typeof flow)["placeVote"]>>["reply"],
    hammer?: ReturnType<(typeof flow)["determineHammer"]>
    setMessage?: ReturnType<(typeof flow)["finish"]>,
}

export async function getVotes(day: number, transaction: Transaction | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(day.toString()).collection('votes');
    const docs = transaction ? (await transaction.get(ref)).docs : (await ref.get()).docs;
    const logs = (docs.map(doc => doc.data()) as (Log | ResetLog | CustomLog)[]).filter(l => l.type != 'custom'); 

    logs.sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf());

    let votes = [] as Vote[];

    logs.forEach(log => {
        if(log.type == 'reset') {
            votes = [];

            return;
        }

        const existing = votes.findIndex(vote => log.vote.id == vote.id);

        if(existing > -1) {
            votes.splice(existing, 1);
        } 

        if(log.vote.for != 'unvote') {
            votes.push(log.vote);
        }
    })

    return votes;
}

export const flow = {
    placeVote: async (t: Transaction, voter: User, voting: User | undefined, type: 'unvote' | 'vote', users: User[], day: number) => {
        const votes = await getVotes(day, t);

        if(type != 'unvote' && voting == undefined) throw new Error("Voter must be specified!");
 
        const existing = votes.findIndex(vote => vote.id == voter.id);
        let removed: undefined | Vote = undefined;

        if(existing > -1) {
            removed = votes[existing];
            votes.splice(existing, 1);
        } 
        
        let vote: Vote | undefined = undefined;
        let reply: { typed: string, emoji: string | ApplicationEmoji };

        if(type != 'unvote' && voting) {
            vote = {
                for: voting.id,
                id: voter.id,
                timestamp: new Date().valueOf(),
                ...(removed ? { replace: removed.for } : {})
            };

            votes.push(vote);

            if(removed?.for == vote.for) {
                reply = {
                    typed: getNickname(voter.id, users) + "'s vote is unchanged!",
                    emoji: process.env.NO_CHANGE ?? "✅"
                }
            } else if(removed) {
                reply = {
                    typed: getNickname(voter.id, users) + " has changed their vote from " + getNickname(removed.for, users) + " to " + getNickname(voting.id, users) + "!",
                    emoji: process.env.VOTE_SWAPPED ?? "✅"
                }
            } else {
                reply = {
                    typed: getNickname(voter.id, users) + " has voted " + getNickname(voting.id, users) + "!",
                    emoji: '✅'
                }
            }
        } else if(type == "unvote" && removed) {
            vote = {
                for: "unvote",
                id: voter.id,
                timestamp: new Date().valueOf(),
                replace: removed.for
            };
            
            reply = {
                typed: getNickname(voter.id, users) + " has unvoted!",
                emoji: "✅",
            }
        } else {
            reply = {
                typed: getNickname(voter.id, users) + " has not voted!",
                emoji: process.env.FALSE ?? "⛔",
            }
        }

        return {
            reply,
            vote,
            votes,
        }
    },
    board: (votes: Vote[], users: User[]) => {
        const counting = [] as { voting: string, voters: string[]}[];

        const all = [...new Set(votes.map(vote => vote.for))];

        all.forEach(votingId => {
            const voting = users.find(user => user.id == votingId)?.nickname ?? "<@" + votingId + ">";

            counting.push({
                voting,
                voters: votes.filter(vote => vote.for == votingId).sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf()).map(voter => users.find(user => user.id == voter.id)?.nickname ?? "<@" + voter.id + ">"),
            });
        });

        counting.sort((a, b) => b.voters.length - a.voters.length);

        const board = counting.reduce((prev, curr) => prev += (curr.voters.length + " - " + curr.voting + " « " + curr.voters.join(", ")) + "\n", "");

        return board;
    },
    finish: (t: Transaction, vote: Vote, board: string, day: number) => {
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('day').doc(day.toString()).collection('votes').doc();

        t.create(ref, {
            board,
            vote,
            messageId: null,
            type: 'standard',
            timestamp: vote.timestamp,
        } satisfies Log);

        return async (id: string) => {
            await ref.update({
                messageId: id,
            });
        }
    },
    determineHammer: (vote: Vote, votes: Vote[], users: User[], global: Global) => {
        let votesForHammer = votes.filter(v => v.for == vote.for);
        const hammerThreshold = parseInt(process.env.HAMMER_THRESHOLD_PLAYERS ?? '-1');
        let half = hammerThreshold === -1 ? Math.floor(global.players.length / 2) : Math.floor(hammerThreshold / 2);

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
}

export async function defaultVote(global: Global, setup: Setup, game: Signups, voter: User, voting: User | undefined, type: 'vote' | 'unvote', users: User[], transaction: Transaction): Promise<TransactionResult> {
    const { reply, vote, votes } = await flow.placeVote(transaction, voter, voting, type, users, global.day); // doesn't save vote yet since board needs to be created
    
    if(vote == undefined) return { reply };

    const board = flow.board(votes, users);

    const setMessage = flow.finish(transaction, vote, board, global.day); // locks in vote

    return {
        reply,
        hammer: flow.determineHammer(vote, votes, users, global),
        setMessage,
    }
}

export async function handleHammer(hammer: TransactionResult["hammer"], global: Global, setup: Setup, game: Signups) {
    if(hammer?.hammered) {
        await lockGame();
        await hammerExtensions(global, setup, game, hammer.id);

        await new Promise(resolve => {
            setTimeout(() => {
                resolve(null);
            }, 2000);
        });

        await setup.primary.chat.send(hammer.message);
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


function getNickname(id: string, users: User[]) {
    return users.find(user => user.id == id)?.nickname ?? "<@" + id + ">";
}

export async function wipe(global: Global, message: string) {
    const db = firebaseAdmin.getFirestore();

    return await db.runTransaction(async (t) => {
        await getVotes(global.day, t); //just need to lock documents

        const board = "";

        const ref = db.collection('day').doc(global.day.toString()).collection('votes').doc();

        t.create(ref, {
            messageId: null,
            message: message == "" ? "Votes have been reset." : message,
            board: board,
            type: "reset",
            timestamp: new Date().valueOf(),
        } satisfies ResetLog);

        return async (id: string) => {
            await ref.update({
                messageId: id,
            });
        };
    });
}