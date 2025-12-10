import { firebaseAdmin } from "../firebase";

export interface Stat {
    player: string,
    gxe: string,
    wr: string,
}

export async function getStats() {
    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('stats');
    const doc = await ref.get();
    const data = doc.data();

    if(!doc.exists || data == undefined) return false;

    return data.overall as Stat[];
}