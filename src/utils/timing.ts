import { firebaseAdmin } from "../firebase";
import { getGlobal, lockGame, unlockGame } from "./main";
import { DateTime } from 'luxon';
const parseHumanRelativeTime = require('parse-human-relative-time')(DateTime)

//i'll deal with this later; 

export function parse(input: string): Date {
    const tz = 'America/Los_Angeles'
    const dt = DateTime.fromJSDate(new Date()).setZone(tz);

    return (parseHumanRelativeTime(input, dt) as DateTime).toJSDate();
} 

export async function setFuture(date: Date, increment: boolean, locking: boolean, grace: boolean) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("lock");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    await ref.update({
        when: date,
        increment: increment,
        type: locking,
        grace: grace,
    });
}

export async function setGrace(type: boolean, date: Date) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    await ref.update({
        type: type,
        when: date,
    });
}

export async function getGrace() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return undefined;

    return { 
        when: data.when.toDate() as Date,
        type: data.type as boolean,  
    }
}

export async function getFuture() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("lock");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return undefined;

    return { 
        when: data.when.toDate() as Date,
        increment: data.increment as boolean,
        type: data.type as boolean,  
    }
}

export async function checkFutureLock() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("lock");

    const data = (await ref.get()).data();

    const global = await getGlobal();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() < new Date().valueOf()) {
        try {
            if(data.type == global.locked) {
                console.log("Already locked/unlocked.");
            } else if(data.type) {
                await lockGame();
            } else {
                await unlockGame(data.increment);
            }

            await db.collection('settings').doc('game').update({
                grace: data.grace,
            });

            await ref.update({
                when: null,
            });
        } catch(e) {
            console.log(e);

            return;
        }
    }
}

export async function checkFutureGrace() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() < new Date().valueOf()) {
        try {
            await db.collection('settings').doc('game').update({
                grace: data.type,
            });

            await ref.update({
                when: null,
            });
        } catch(e) {
            console.log(e);

            return;
        }
    }
}