import { DateTime } from 'luxon';
import { firebaseAdmin } from "../firebase";
import { getSetup } from "../setup";
import { getGameByID, getGameSetup } from "./games";
import { lockGame, unlockGame } from "./main";
import { Instance } from '../instance';

export async function setFuture(date: Date, increment: boolean, locking: boolean, grace: boolean, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc("lock");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    await ref.update({
        when: date,
        increment: increment,
        type: locking,
        grace: grace,
    });
}

export async function setGrace(type: boolean, date: Date, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    await ref.update({
        type: type,
        when: date,
    });
}

export async function getGrace(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return undefined;

    return { 
        when: data.when.toDate() as Date,
        type: data.type as boolean,  
    }
}

export async function getFuture(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc("lock");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return undefined;

    return { 
        when: data.when.toDate() as Date,
        increment: data.increment as boolean,
        type: data.type as boolean,  
    }
}

export async function checkFutureLock(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc("lock");

    const data = (await ref.get()).data();

    const global = instance.global;

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() - (25 * 1000) < new Date().valueOf()) {
        await db.collection('instances').doc(instance.id).collection('settings').doc('game').update({
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
                
            const setup = instance.setup;

            await setup.primary.chat.sendTyping();

            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(0);
                }, data.when.toDate().valueOf() - new Date().valueOf())
            });

            if(data.type) {
                await lockGame(instance);
            } else {
                await unlockGame(instance, data.increment);
            }
        } catch(e) {
            console.log(e);

            const setup = instance.setup;
            const global = instance.global;
            const gameSetup = await getGameSetup(await getGameByID(global.game ?? "", instance), setup);

            gameSetup.spec.send("<@&" + setup.secondary.mod.id + "> Failed to lock channel.");

            return;
        }
    }
}

export async function checkFutureGrace(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc("grace");

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() < new Date().valueOf()) {
        try {
            await db.collection('instances').doc(instance.id).collection('settings').doc('game').update({
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