import { ChannelType, type TextChannel } from "discord.js";
import type { Instance } from "../instance";
import client from "../../discord/client";
import { firebaseAdmin } from "../firebase";
import { getGameByID, getGameSetup, type GameSetup, type Signups } from "./games";
import { defaultState, stateRef, type GameOptions, type GameState } from "./state";

// Everything a command or event needs to act on one game. Commands resolve a context once at their entry point (from the
// channel they ran in, see findRunningGame) and pass it down.

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

const running = new Map<string, { ids: string[], timestamp: number }>();

// Every started game. Read from each active game's state, not the settings pointer, so it works once several games run.
// Pass useCache for hot paths (message tracking) that can tolerate ~20s staleness.
export async function getRunningGames(instance: Instance, useCache: boolean = false): Promise<GameContext[]> {
    const cachedIds = running.get(instance.id);

    if(useCache && cachedIds && Date.now() - cachedIds.timestamp < TTL) {
        const contexts = await Promise.all(cachedIds.ids.map(async id => {
            const cached = cache.get(key(instance, id));

            if(cached && Date.now() - cached.timestamp < TTL) return { ...cached.context, instance };

            return await getGameContext(instance, id).catch(() => undefined);
        }));

        return contexts.filter(context => context != undefined && context.state.started) as GameContext[];
    }

    const games = await firebaseAdmin.getFirestore().collection('instances').doc(instance.id).collection('games').where('state', '==', 'active').get();

    const contexts = (await Promise.all(games.docs.map(async doc => {
        const state = (await stateRef(instance, doc.id).get()).data();
        if(state?.started != true) return undefined;

        return await getGameContext(instance, doc.id).catch(() => undefined);
    }))).filter(context => context != undefined) as GameContext[];

    running.set(instance.id, { ids: contexts.map(context => context.game.id), timestamp: Date.now() });

    return contexts;
}

// The channel an event happened in, for commands, interactions and reactions alike.
export function channelOf(event: any): string | null {
    if(typeof event?.channelId == 'string') return event.channelId;
    if(typeof event?.message?.channelId == 'string') return event.message.channelId;

    return null;
}

// The running game that owns a channel: its main, spectator or mafia chat, or anything in its dm category (player dms,
// chats, threads, including threads inside those channels). No fallback; undefined if no running game owns it.
export async function findGameForChannel(instance: Instance, channelId: string | null, useCache: boolean = false): Promise<GameContext | undefined> {
    if(channelId == null) return undefined;

    const games = await getRunningGames(instance, useCache);

    const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
    const base = channel && channel.isThread() ? channel.parent : channel;
    const category = base && 'parentId' in base ? base.parentId : null;

    return games.find(({ gameSetup }) =>
        [gameSetup.main.id, gameSetup.spec.id, gameSetup.mafia.id].includes(channelId) ||
        (base != null && [gameSetup.main.id, gameSetup.spec.id, gameSetup.mafia.id].includes(base.id)) ||
        category == gameSetup.dms.id
    );
}

// The game a command acts on: the named game if given (must be running), else the game that owns the channel, else the
// only running game. Undefined if no game is running, or if several are and the channel doesn't pick one.
export async function findRunningGame(instance: Instance, channelId: string | null = null, useCache: boolean = false, gameName: string | null = null): Promise<GameContext | undefined> {
    const games = await getRunningGames(instance, useCache);

    if(gameName) return games.find(game => game.game.name.toLowerCase() == gameName.toLowerCase());

    const owner = await findGameForChannel(instance, channelId, useCache);
    if(owner) return owner;

    return games.length == 1 ? games[0] : undefined;
}

export async function getRunningGame(instance: Instance, channelId: string | null = null, useCache: boolean = false, gameName: string | null = null): Promise<GameContext> {
    const context = await findRunningGame(instance, channelId, useCache, gameName);

    if(context) return context;

    if(gameName) throw new Error(gameName + " is not a running game.");

    const games = await getRunningGames(instance, useCache);

    if(games.length == 0) throw new Error("Game has not started.");

    throw new Error("More than one game is running (" + games.map(game => game.game.name).join(", ") + "). Run this in the game's channels or name the game.");
}

// For commands: resolve the game from the channel the command ran in (or the named game), and label the command's replies
// with the game it acted on, so it's always clear which game a command touched.
export async function getCommandGame(event: any, gameName: string | null = null): Promise<GameContext> {
    const context = await getRunningGame(event.instance, channelOf(event), false, gameName);

    labelReplies(event, context.game.name);

    return context;
}

// Same, but undefined instead of an error when no game applies.
export async function findCommandGame(event: any, gameName: string | null = null): Promise<GameContext | undefined> {
    const context = await findRunningGame(event.instance, channelOf(event), false, gameName);

    if(context) labelReplies(event, context.game.name);

    return context;
}

// Appends "-# Game: <name>" to everything the command replies with. Text commands that only react get no label.
export function labelReplies(event: any, name: string) {
    if(event == null || event.__gameLabel != undefined) return;

    event.__gameLabel = name;

    for(const method of ['reply', 'editReply', 'update', 'followUp']) {
        const original = event[method];
        if(typeof original != 'function') continue;

        event[method] = (options: any, ...rest: any[]) => original.call(event, withGameLabel(options, name), ...rest);
    }
}

function withGameLabel(options: any, name: string) {
    const label = "-# Game: " + name;

    if(typeof options == 'string') return options.length + label.length < 1990 ? options + "\n" + label : options;

    if(options == null || typeof options != 'object' || options.constructor?.name == 'MessagePayload') return options;

    if(typeof options.content == 'string' && options.content.length > 0) {
        return options.content.length + label.length < 1990 ? { ...options, content: options.content + "\n" + label } : options;
    }

    if(Array.isArray(options.embeds) && options.embeds.length > 0) return { ...options, content: label };

    return options;
}

const mainChats = new Map<string, { ids: Set<string>, timestamp: number }>();

// Main chats tracked in the primary server: the server's main chat and every game's main chat (games keep theirs
// after ending, so stars and edits there still count). Cached for TTL; refreshed when a game is created.
export async function getMainChatIds(instance: Instance, useCache: boolean = true) {
    const cached = mainChats.get(instance.id);

    if(useCache && cached && Date.now() - cached.timestamp < TTL) return cached.ids;

    const games = await firebaseAdmin.getFirestore().collection('instances').doc(instance.id).collection('games').get();

    const ids = new Set([instance.setup.primary.chat.id, ...games.docs.map(doc => doc.data().channels?.main as string | undefined).filter(id => id != undefined)]);

    mainChats.set(instance.id, { ids, timestamp: Date.now() });

    return ids;
}

export async function isMainChat(instance: Instance, channelId: string) {
    return (await getMainChatIds(instance)).has(channelId);
}

// The main chats as channels, skipping any that were deleted.
export async function getMainChats(instance: Instance) {
    const ids = await getMainChatIds(instance, false);

    const channels = await Promise.all([...ids].map(id => instance.setup.primary.guild.channels.fetch(id).catch(() => null)));

    return channels.filter(channel => channel != null && channel.type == ChannelType.GuildText) as TextChannel[];
}

export function clearMainChatCache(instance: Instance) {
    mainChats.delete(instance.id);
}

// Keep the cached copy in step after this process writes state, so hot paths don't act on what it just changed.
export function updateCachedContext(context: GameContext) {
    cache.set(key(context.instance, context.game.id), { context, timestamp: Date.now() });
}

export function clearCachedContext(instance: Instance, game: string) {
    cache.delete(key(instance, game));
    running.delete(instance.id);
}

// Forget which games are running, e.g. after a game starts.
export function clearRunningCache(instance: Instance) {
    running.delete(instance.id);
}
