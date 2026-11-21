import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, type Message } from "discord.js";
import client from "../../discord/client";
import { getEnabledExtensions } from "../extensions";
import { firebaseAdmin } from "../firebase";
import type { Instance } from "../instance";
import { getGameContext, type GameContext } from "./context";
import { gameRef, type Signups } from "./games";
import type { Log } from "./vote";

// A live vote board: a message (posted with /mod board) that the bot keeps edited with the current day's votes, the same
// way the signups embed tracks signups. Stored on the game doc as `voteBoard`.

// Latest board text recorded for a day ("" if none).
export async function getBoardText(instance: Instance, gameId: string, day: number) {
    const docs = (await firebaseAdmin.getFirestore().collection('instances').doc(instance.id).collection('games').doc(gameId).collection('days').doc(day.toString()).collection('votes').orderBy('timestamp', 'desc').limit(1).get()).docs;

    return docs.length == 1 ? (docs[0].data() as Log).board ?? "" : "";
}

// Footer for the current day: an extension's onVotes text, or the hammer threshold when auto hammer is on.
export async function getHammerFooter(ctx: GameContext, board: string) {
    const custom = parseInt(process.env.HAMMER_THRESHOLD_PLAYERS ?? '-1');
    const bots = ctx.state.players.filter(player => player.alignment == "bot").length;
    const players = custom === -1 ? (ctx.state.players.length - bots) : custom;
    const standard = "Hammer is at " + (Math.floor(players / 2) + 1) + " votes.";

    const extension = getEnabledExtensions(ctx).find(extension => extension.priority.includes("onVotes"));

    if(extension) {
        const footer = await extension.onVotes(ctx, board);

        return footer == "" ? standard : footer;
    }

    return ctx.state.hammer ? standard : null;
}

export function historyButton(instance: Instance, gameId: string, day: number) {
    return new ButtonBuilder()
        .setLabel("History")
        .setStyle(ButtonStyle.Link)
        .setURL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN as string : process.env.DOMAIN as string) + "/" + instance.id + "/" + gameId + "?tab=Votes&day=" + day);
}

async function fetchBoardMessage(board: { id: string, channel: string }) {
    const channel = await client.channels.fetch(board.channel);

    if(channel == null || !channel.isTextBased()) throw new Error("Vote board channel not found.");

    return await channel.messages.fetch(board.id);
}

async function renderBoard(ctx: GameContext) {
    const { instance, game, state } = ctx;

    if(!state.started || state.day < 1) {
        return {
            embeds: [new EmbedBuilder().setTitle("Live Votes » " + game.name).setColor(Colors.DarkGrey).setDescription("Game is not running.")],
            components: [],
        };
    }

    const board = await getBoardText(instance, game.id, state.day);

    const embed = new EmbedBuilder()
        .setTitle("Live Votes » " + game.name + " Day " + state.day + (state.locked ? " (Locked)" : ""))
        .setColor(state.locked ? Colors.DarkRed : Colors.Gold)
        .setDescription(board == "" ? "No votes yet." : board);

    const footer = await getHammerFooter(ctx, board);
    if(footer) embed.setFooter({ text: footer });

    return {
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(historyButton(instance, game.id, state.day))],
    };
}

async function editBoard(instance: Instance, gameId: string) {
    const ctx = await getGameContext(instance, gameId);
    const board = ctx.game.voteBoard;

    if(board == null) return;

    const message = await fetchBoardMessage(board).catch(() => undefined);

    if(!message || !message.editable) return;

    await message.edit(await renderBoard(ctx));
}

// Votes can come in bursts, so edits are coalesced per game: one edit shortly after the last change, and never two at once.
const pending = new Map<string, { timer: NodeJS.Timeout | null, running: boolean, again: boolean }>();
const DELAY = 1500;

export function refreshVoteBoard(instance: Instance, gameId: string) {
    const key = instance.id + "/" + gameId;
    const entry = pending.get(key) ?? { timer: null, running: false, again: false };

    pending.set(key, entry);

    if(entry.running) {
        entry.again = true;

        return;
    }

    if(entry.timer) clearTimeout(entry.timer);

    entry.timer = setTimeout(async () => {
        entry.timer = null;
        entry.running = true;

        try {
            await editBoard(instance, gameId);
        } catch(e) {
            console.log("Failed to refresh vote board.", e);
        }

        entry.running = false;

        if(entry.again) {
            entry.again = false;

            refreshVoteBoard(instance, gameId);
        } else {
            pending.delete(key);
        }
    }, DELAY);
}

// Points the game at a new board message, and deactivates the old one (with a button to bring it back).
export async function activateVoteBoard(ctx: GameContext, message: Message) {
    const { instance, game } = ctx;
    const old = game.voteBoard;

    await gameRef(instance, game.id).update({
        voteBoard: {
            id: message.id,
            channel: message.channelId,
        },
    } satisfies Partial<Signups>);

    game.voteBoard = { id: message.id, channel: message.channelId };

    await message.edit(await renderBoard(ctx));

    if(old == null || old.id == message.id) return;

    const previous = await fetchBoardMessage(old).catch(() => undefined);

    if(!previous || !previous.editable) return;

    await previous.edit({
        embeds: [
            new EmbedBuilder()
                .setTitle("Live Votes » " + game.name)
                .setColor(Colors.Red)
                .setDescription("This vote board has been deactivated.")
        ],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "reactivate-board", game: game.id }))
                    .setLabel("Reactivate")
                    .setStyle(ButtonStyle.Danger)
            )
        ],
    }).catch(() => undefined);
}
