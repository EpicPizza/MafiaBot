import { FieldValue, Firestore } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import type { Global } from "../global";
import type { Instance } from "../instance";
import type { Player } from "./main";

// Per-game state, stored at instances/{instance}/games/{game}/state/{game|lock|grace}.
// Instance-wide settings (active game pointer, admins, bulletin, extensions, hammer) stay in instances/{instance}/settings/game.

export interface GameState {
    started: boolean,
    locked: boolean,
    players: Player[],
    day: number,
    grace: boolean,
}

export type InstanceSettings = Omit<Global, keyof GameState>;

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

    if('started' in settings) {
        await migrateLegacyState(instanceId, settings, db);
        settings = (await ref.get()).data() ?? settings;
    }

    const instance = {
        game: settings.game ?? null,
        admin: settings.admin ?? [],
        bulletin: settings.bulletin ?? null,
        extensions: settings.extensions ?? [],
        hammer: settings.hammer ?? true,
    } satisfies InstanceSettings;

    let state = defaultState;

    if(instance.game != null) {
        const data = (await stateCollection(instanceId, instance.game, db).doc('game').get()).data();

        if(data) state = { ...defaultState, ...data } as GameState;
    }

    return { ...instance, ...state, players: [...state.players] };
}

// One-time move of settings/game, settings/lock and settings/grace into the running game's state docs.
async function migrateLegacyState(instanceId: string, settings: FirebaseFirestore.DocumentData, db: Firestore) {
    const settingsDoc = settingsRef(instanceId, db);

    if(settings.game) {
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

    await settingsDoc.update(Object.fromEntries(stateFields.map(field => [field, FieldValue.delete()])));

    console.log("Migrated game state for instance " + instanceId + (settings.game ? " (game " + settings.game + ")." : "."));
}

function ignoreExists(e: any) {
    if(e?.code == 6) return; // ALREADY_EXISTS

    throw e;
}
