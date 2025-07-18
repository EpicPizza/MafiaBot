import { firebaseAdmin } from "../firebase";
import { REST, Routes, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { Data } from "../discord";
import { Transaction } from "firebase-admin/firestore";

export interface Vote {
    id: string,
    for: string | 'unvote',
    timestamp: number,
}

export interface Log {
    vote: Vote,
    board: string,
    messageId: string, 
}

export async function getVotes(transaction: Transaction, options: { day: number }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes');
    const docs = (await transaction.get(ref)).docs;
    const logs = docs.map(doc => doc.data()) as Log[]; 

    logs.sort((a, b) => a.vote.timestamp.valueOf() - b.vote.timestamp.valueOf());

    const votes = [] as Vote[];

    logs.forEach(log => {
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

export async function resetVotes(options: { day: number | string } | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    if(options) {
        const ref = db.collection('day').doc(options.day.toString()).collection('votes');

        const docs = await ref.listDocuments();

        const batch = db.batch();

        docs.forEach(ref => batch.delete(ref));

        await batch.commit();
    } else {
        const ref = db.collection('day');

        const days = await ref.listDocuments();

        for(let i = 0; i < days.length; i++) {
            await resetVotes({ day: days[i].id });
        }
    }
}