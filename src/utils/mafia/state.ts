import { FieldValue, Firestore } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import type { Global } from "../global";
import type { Instance } from "../instance";
import type { Player } from "./main";

// Per-game state, stored at instances/{instance}/games/{game}/state/{game|lock|grace}.
// Per-game options (extensions, hammer) live on the game doc itself, since they're set before the game starts.
// Instance-wide settings (running game pointer, admins) stay in instances/{instance}/settings/game.

export interface GameState {
    started: boolean,
    locked: boolean,
    players: Player[],
    day: number,
    grace: boolean,
}

export interface GameOptions {
    extensions: string[],
    hammer: boolean,
}

export type InstanceSettings = Omit<Global, keyof GameState | keyof GameOptions>;

const legacyFields = ['bulletin', 'extensions', 'hammer'];

export const defaultState: GameState = {
    started: false,
    locked: false,
    players: [],
    day: 0,
    grace: false,
};

const stateFields = Object.keys(defaultState) as (keyof GameState)[];

function getDB(db?: Firestore) {
    return db ?? firebaseAdmin.getFirestore();
}

export function settingsRef(instance: Instance | string, db?: Firestore) {
    return getDB(db).collection('instances').doc(typeof instance == 'string' ? instance : instance.id).collection('settings').doc('game');
}

function gameDocRef(instanceId: string, game: string, db?: Firestore) {
    return getDB(db).collection('instances').doc(instanceId).collection('games').doc(game);
}

function stateCollection(instanceId: string, game: string, db?: Firestore) {
    return getDB(db).collection('instances').doc(instanceId).collection('games').doc(game).collection('state');
}

function activeGame(instance: Instance, game?: string | null) {
    const id = game ?? instance.global.game;

    if(id == null) throw new Error("No game is running.");

    return id;
}

export function stateRef(instance: Instance, game?: string | null) {
    return stateCollection(instance.id, activeGame(instance, game)).doc('game');
}

export function lockRef(instance: Instance, game?: string | null) {
    return stateCollection(instance.id, activeGame(instance, game)).doc('lock');
}

export function graceRef(instance: Instance, game?: string | null) {
    return stateCollection(instance.id, activeGame(instance, game)).doc('grace');
}

export async function createGameState(instance: Instance, game: string, state: Partial<GameState>) {
    const collection = stateCollection(instance.id, game);

    await Promise.all([
        collection.doc('game').set({ ...defaultState, ...state } satisfies GameState),
        collection.doc('lock').set({ increment: false, when: null, type: false, grace: true }),
        collection.doc('grace').set({ when: null, type: false }),
    ]);
}

// Reads instance settings and the running game's state and merges them into the Global shape the rest of the bot uses.
export async function loadGlobal(instanceId: string, db: Firestore): Promise<Global | undefined> {
    const ref = settingsRef(instanceId, db);
    let settings = (await ref.get()).data();

    if(settings == undefined) return undefined;

    const legacy = settings;

    if('started' in legacy || legacyFields.some(field => field in legacy)) {
        await migrateLegacyState(instanceId, legacy, db);
        settings = (await ref.get()).data() ?? settings;
    }

    const instance = {
        game: settings.game ?? null,
        admin: settings.admin ?? [],
    } satisfies InstanceSettings;

    let state = defaultState;
    let options: GameOptions = { extensions: [], hammer: true };

    if(instance.game != null) {
        const [stateDoc, gameDoc] = await Promise.all([
            stateCollection(instanceId, instance.game, db).doc('game').get(),
            gameDocRef(instanceId, instance.game, db).get(),
        ]);

        const data = stateDoc.data();
        if(data) state = { ...defaultState, ...data } as GameState;

        const game = gameDoc.data();
        if(game) options = { extensions: game.extensions ?? [], hammer: game.hammer ?? true };
    }

    return { ...instance, ...state, ...options, players: [...state.players] };
}

// One-time move of settings/game, settings/lock and settings/grace into the running game's state docs,
// and of instance-wide extensions/hammer onto every active game that doesn't have its own yet.
async function migrateLegacyState(instanceId: string, settings: FirebaseFirestore.DocumentData, db: Firestore) {
    const settingsDoc = settingsRef(instanceId, db);

    if('extensions' in settings || 'hammer' in settings) {
        const games = await getDB(db).collection('instances').doc(instanceId).collection('games').where('state', '==', 'active').get();

        await Promise.all(games.docs.map(game => {
            const data = game.data();
            const update: Partial<GameOptions> = {};

            if(data.extensions == undefined) update.extensions = settings.extensions ?? [];
            if(data.hammer == undefined) update.hammer = settings.hammer ?? true;

            return Object.keys(update).length > 0 ? game.ref.update(update) : undefined;
        }));
    }

    if(settings.game && 'started' in settings) {
        const collection = stateCollection(instanceId, settings.game, db);
        const legacy = settingsDoc.parent;

        const [lock, grace] = await Promise.all([legacy.doc('lock').get(), legacy.doc('grace').get()]);

        const state = Object.fromEntries(stateFields.map(field => [field, settings[field] ?? defaultState[field]])) as unknown as GameState;

        await Promise.all([
            collection.doc('game').create(state).catch(ignoreExists),
            collection.doc('lock').create(lock.data() ?? { increment: false, when: null, type: false, grace: true }).catch(ignoreExists),
            collection.doc('grace').create(grace.data() ?? { when: null, type: false }).catch(ignoreExists),
        ]);
    }

    await settingsDoc.update(Object.fromEntries([...stateFields, ...legacyFields].filter(field => field in settings).map(field => [field, FieldValue.delete()])));

    console.log("Migrated game state for instance " + instanceId + (settings.game ? " (game " + settings.game + ")." : "."));
}

function ignoreExists(e: any) {
    if(e?.code == 6) return; // ALREADY_EXISTS

    throw e;
}
