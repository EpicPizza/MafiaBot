import { firebaseAdmin } from "../firebase";
import { REST, Routes, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { Data } from "../discord";

export interface Vote {
    id: string,
    for: string,
    timestamp: number,
}

export async function addVoteLog(options: { id: string, message: string, day: number, type: string, for: string | null }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes').doc('history').collection('logs');

    await ref.add({
        id: options.id,
        message: options.message,
        timestamp: new Date().valueOf(),
        type: options.type,
        for: options.for
    })
} 

export async function setVote(options: { id: string, for: string, day: number }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes').doc(options.id);

    await ref.set({
        id: options.id,
        for: options.for,
        timestamp: new Date().valueOf(),
    })
}

export async function removeVote(options: { id: string, day: number }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes').doc(options.id);

    await ref.delete();
}

export async function getVotes(options: { day: number }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes');

    const docs = (await ref.get()).docs;

    const votes = new Array<Vote>();

    for(let i = 0; i < docs.length; i++) {
        const data = docs[i].data();

        if(data && docs[i].id != "history") {
            votes.push(data as Vote);
        }
    }

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