import { Response } from "express";
import discord from "./discord";
import { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { DocumentData, FieldValue } from "firebase-admin/firestore";
import { firebaseAdmin } from "./firebase";

export function getGuild(guildId: string) {
    const guild = discord.guilds.cache.get(guildId);
    if(!guild) throw new Error("Guild not found.");

    return guild;
}

interface Game {
    started: boolean,
}

export async function getGame() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    const doc = await ref.get();

    const data = doc.data();

    if(data) {
        return data as Game;
    }

    throw new Error("Could not find game on database.");
}

interface User {
    id: string,
    nickname: string,
    settings: {
        auto_confirm: false,
    }
}

export async function getUser(id: string): Promise<User | undefined> {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users').doc(id);

    const doc = await ref.get();

    const data = doc.data();

    if(!doc.exists) {
        return undefined;
    } else if(data) {
        return data as User;
    }
}

