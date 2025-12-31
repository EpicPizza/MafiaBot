import { firebaseAdmin } from "../firebase";
import { Instance } from "../instance";

export interface Stat {
    player: string,
    gxe: string,
    wr: string,
}

export async function getStats(instance: Instance) {
    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('instances').doc(instance.id).collection('settings').doc('stats');
    const doc = await ref.get();
    const data = doc.data();

    if(!doc.exists || data == undefined) return false;

    return data.overall as Stat[];
}