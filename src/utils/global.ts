import type { Transaction } from "firebase-admin/firestore";
import { firebaseAdmin } from "./firebase";
import type { Player } from "./mafia/main";

export async function getGlobal(t: Transaction | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('game');

    const doc = t ? await t.get(ref) : await ref.get();

    const data = doc.data();

    if(data) {
        return data as Global;
    }

    throw new Error("Could not find game on database.");
}

export interface Global {
    started: boolean,
    locked: boolean,
    players: Player[]
    day: number,
    game: string | null,
    bulletin: string | null, 
    extensions: string[],
    grace: boolean,
    admin: string[],
    hammer: boolean,
}
