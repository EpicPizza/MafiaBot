import type { Instance } from "../instance";
import { getGameByID, getGameSetup, type GameSetup, type Signups } from "./games";
import { defaultState, stateRef, type GameOptions, type GameState } from "./state";

// Everything a command or event needs to act on one game. Commands resolve a context once at their entry point and pass it down,
// instead of reading the running game off instance.global. Stage 4 swaps how it's resolved (from the channel) without touching callers.

export type RunningState = GameState & GameOptions;

export interface GameContext {
    instance: Instance,
    game: Signups,
    state: RunningState,
    gameSetup: GameSetup,
}

const cache = new Map<string, { context: GameContext, timestamp: number }>();
const TTL = 1000 * 20; // same staleness the cached instance had for message tracking

function key(instance: Instance, game: string) {
    return instance.id + "/" + game;
}

export async function getGameContext(instance: Instance, gameId: string, allowCompleted: boolean = false): Promise<GameContext> {
    const [game, stateDoc] = await Promise.all([
        getGameByID(gameId, instance, allowCompleted),
        stateRef(instance, gameId).get(),
    ]);

    const gameSetup = await getGameSetup(game, instance.setup);

    const state = { ...defaultState, ...stateDoc.data() } as GameState;

    const context: GameContext = {
        instance,
        game,
        gameSetup,
        state: {
            ...state,
            players: [...state.players],
            extensions: game.extensions ?? [],
            hammer: game.hammer ?? true,
        },
    };

    cache.set(key(instance, gameId), { context, timestamp: Date.now() });

    return context;
}

// The running game, or undefined if none. Pass useCache for hot paths (message tracking) that can tolerate ~20s staleness.
export async function findRunningGame(instance: Instance, useCache: boolean = false): Promise<GameContext | undefined> {
    const id = instance.global.game;

    if(id == null) return undefined;

    if(useCache) {
        const cached = cache.get(key(instance, id));

        if(cached && Date.now() - cached.timestamp < TTL) return cached.context.state.started ? { ...cached.context, instance } : undefined;
    }

    const context = await getGameContext(instance, id).catch(() => undefined);

    if(context == undefined || !context.state.started) return undefined;

    return context;
}

export async function getRunningGame(instance: Instance, useCache: boolean = false): Promise<GameContext> {
    const context = await findRunningGame(instance, useCache);

    if(context == undefined) throw new Error("Game has not started.");

    return context;
}

// Keep the cached copy in step after this process writes state, so hot paths don't act on what it just changed.
export function updateCachedContext(context: GameContext) {
    cache.set(key(context.instance, context.game.id), { context, timestamp: Date.now() });
}

export function clearCachedContext(instance: Instance, game: string) {
    cache.delete(key(instance, game));
}
