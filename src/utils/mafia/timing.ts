import { DateTime } from 'luxon';
import { firebaseAdmin } from "../firebase";
import { getGlobal } from '../global';
import { getSetup } from "../setup";
import { getGameByID, getGameSetup } from "./games";
import { lockGame, unlockGame } from "./main";

export async function setFuture(date: Date, increment: boolean, locking: boolean, grace: boolean) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc("lock");

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

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    await ref.update({
        type: type,
        when: date,
    });
}

export async function getGrace() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc("grace");

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

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc("lock");

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

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc("lock");

    const data = (await ref.get()).data();

    const global = await getGlobal();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() - (25 * 1000) < new Date().valueOf()) {
        await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('game').update({
            grace: data.grace,
        });

        await ref.update({
            when: null,
        });
       
        if(data.type == global.locked) {
            console.log("Already locked/unlocked.");

            return;
        }

        try {
            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(0);
                }, data.when.toDate().valueOf() - new Date().valueOf() - (10 * 1000))
            });
                
            const setup = await getSetup();

            await setup.primary.chat.sendTyping();

            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(0);
                }, data.when.toDate().valueOf() - new Date().valueOf())
            });

            if(data.type) {
                await lockGame();
            } else {
                await unlockGame(data.increment);
            }
        } catch(e) {
            console.log(e);

            const setup = await getSetup();
            const global = await getGlobal();
            const gameSetup = await getGameSetup(await getGameByID(global.game ?? ""), setup);

            gameSetup.spec.send("<@&" + setup.secondary.mod.id + "> Failed to lock channel.");

            return;
        }
    }
}

export async function checkFutureGrace() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() < new Date().valueOf()) {
        try {
            await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('game').update({
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