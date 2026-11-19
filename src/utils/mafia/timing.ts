import { DateTime } from 'luxon';
import { firebaseAdmin } from "../firebase";
import { lockGame, unlockGame } from "./main";
import { graceRef, lockRef, stateRef } from './state';
import { getGameContext, type GameContext } from './context';

// All timers belong to one game. ready.ts runs checkFutureLock/checkFutureGrace for each running game.

export async function setFuture(date: Date, increment: boolean, locking: boolean, grace: boolean, ctx: GameContext) {
    const ref = lockRef(ctx.instance, ctx.game.id);

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    await ref.update({
        when: date,
        increment: increment,
        type: locking,
        grace: grace,
    });
}

export async function setGrace(type: boolean, date: Date, ctx: GameContext) {
    const ref = graceRef(ctx.instance, ctx.game.id);

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    await ref.update({
        type: type,
        when: date,
    });
}

export async function getGrace(ctx: GameContext) {
    const ref = graceRef(ctx.instance, ctx.game.id);

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return undefined;

    return { 
        when: data.when.toDate() as Date,
        type: data.type as boolean,  
    }
}

export async function getFuture(ctx: GameContext) {
    const ref = lockRef(ctx.instance, ctx.game.id);

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return undefined;

    return { 
        when: data.when.toDate() as Date,
        increment: data.increment as boolean,
        type: data.type as boolean,  
    }
}

export async function checkFutureLock(ctx: GameContext) {
    const { instance, game } = ctx;

    const ref = lockRef(instance, game.id);

    const data = (await ref.get()).data();

    const global = ctx.state;

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() - (25 * 1000) < new Date().valueOf()) {
        await stateRef(instance, game.id).update({
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

            await ctx.gameSetup.main.sendTyping();

            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(0);
                }, data.when.toDate().valueOf() - new Date().valueOf())
            });

            // Reload: the game may have been locked/unlocked by hand while waiting.
            const current = await getGameContext(instance, game.id);

            if(data.type) {
                await lockGame(current);
            } else {
                await unlockGame(current, data.increment);
            }
        } catch(e) {
            console.log(e);

            const setup = instance.setup;

            ctx.gameSetup.spec.send("<@&" + setup.secondary.mod.id + "> Failed to lock channel.");

            return;
        }
    }
}

export async function checkFutureGrace(ctx: GameContext) {
    const { instance, game } = ctx;

    const ref = graceRef(instance, game.id);

    const data = (await ref.get()).data();

    if(!data) throw new Error("Database not setup.");

    if(data.when == null) return;

    if(data.when.toDate().valueOf() < new Date().valueOf()) {
        try {
            await stateRef(instance, game.id).update({
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