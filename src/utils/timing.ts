import { firebaseAdmin } from "../firebase";
import { unlockGame } from "./game";

//i'll deal with this later; 

export async function parse(input: string): Promise<Date> {
    return new Date(new Date().valueOf() + (1000 * 5));
} 

export async function setFutureLock(date: Date) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("lock");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when != null) return data.when.toDate() as Date;

    await ref.update({
        when: date,
    });
}

export async function checkFutureLock() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("lock");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() < new Date().valueOf()) {
        try {
            await unlockGame();

            await ref.update({
                when: null,
            });
        } catch(e) {
            console.log(e);

            return;
        }
    }
}