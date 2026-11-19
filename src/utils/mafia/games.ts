import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder, OverwriteType, Role, TextChannel } from "discord.js";
import { FieldValue, Query } from "firebase-admin/firestore";
import { z } from "zod";
import type { TextCommand } from '../../discord';
import client from "../../discord/client";
import { register } from "../../register";
import { firebaseAdmin } from "../firebase";
import { getSetup } from "../setup";
import { getPlayerObjects, getUser } from "./user";
import { Instance } from "../instance";
import { isGameStarted } from "./state";

export interface Signups {
    name: string,
    signups: string[],
    id: string,
    closed: boolean,
    message: {
        id: string,
        channel?: string, // missing on signups created before signups could be posted outside main chat
    } | null,
    channels: {
        spec: string,
        mafia: string,
        main?: string, // the game's day chat; missing on games from before per-game main chats (they use setup.primary.chat)
        mainCreated?: boolean, // true if the bot made the main chat (and so may lock it on archive)
        dms?: string, // the game's dm category; missing on older games (they use setup.secondary.dms)
    }
    roles?: {
        alive: string, // the game's alive role; missing on older games (they use setup.primary.alive)
    }
    confirmations: string[],
    mods: string[],
    extensions?: string[], // missing on games created before extensions were per game
    hammer?: boolean,
    days: number,
    alignments: string[],
    winners: string[],
    losers: string[],
    links: Link[],
    state: 'active' | 'completed' | 'counting' | 'canned',
    pinned: string | null,
    start: number | null,
    end: number | null,
}

type Link = DiscordLink | MaterialLink;

interface DiscordLink {
    type: 'Discord'
    channelName: string,
    label: string,
    url: string,
}

interface MaterialLink {
    type: 'Material',
    logo: 'Drive' | 'Slides' | 'Docs' | 'Sheets' | 'Custom',
    label: string,
    url: string,
}

export async function addSignup(options: { id: string, game: string }, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const game = await getGameByName(options.game, instance);
    const gameSetup = await getGameSetup(game, instance.setup);

    if (game == null) return false;

    await checkModPlayConflict(options.id, 'player', instance);

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(game.id);

    const result = await db.runTransaction(async t => {
        const doc = await t.get(ref);

        const data = doc.data();

        if (data == undefined) return;

        const confirmed = (data.confirmations as string[]).includes(options.id);
        const added = !(data.signups as string[]).includes(options.id);

        if (added) {
            t.update(ref, {
                signups: FieldValue.arrayUnion(options.id)
            })
        }

        return { confirmed, added };
    });

    const confirmed = result?.confirmed;

    if (result?.added) {
        await runSignupHooks('onSignup', game, options.id, instance);
    }

    const playerObjects = await getPlayerObjects(options.id, instance);

    if (playerObjects.player) {
        const member = playerObjects.player;

        if (member.roles.cache.get(instance.setup.primary.gang.id) == undefined) {
            await member.roles.add(instance.setup.primary.gang.id);
        }
    }

    if (confirmed === false) {
        const dm = await (await client.users.fetch(options.id)).createDM();

        if (!dm) return await gameSetup.spec.send("Unable to send dms to <@" + options.id + ">.");

        const db = firebaseAdmin.getFirestore();

        const domain = (process.env.DEV == 'TRUE' ? process.env.DEVDOMAIN : process.env.DOMAIN);
        let message = "";

        const query = db.collection('documents').where('integration', '==', 'Welcome');
        const docs = (await query.get()).docs;
        if (docs.length < 1) message = domain + "/docs/welcome-message/";
        if (docs.length > 0) message = (docs[0].data().content as string).replaceAll("](/", "](" + domain + "/");

        const embed = new EmbedBuilder()
            .setTitle('Welcome!')
            .setDescription(message)
            .setColor(Colors.Yellow)

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "confirm-signup", game: game.name, instance: instance.id }))
                    .setStyle(ButtonStyle.Primary)
                    .setLabel('Confirm')
            )

        await dm.send({ components: [row], embeds: [embed] });
    }

    return true;
}

export async function removeSignup(options: { id: string, game: string }, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const id = await getGameID(options.game, instance);

    if (id == null) return false;

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(id);

    const removed = await db.runTransaction(async t => {
        const doc = await t.get(ref);

        const data = doc.data();

        if (data == undefined) return false;

        const removed = (data.signups as string[]).includes(options.id);

        t.update(ref, {
            signups: FieldValue.arrayRemove(options.id)
        })

        return removed;
    });

    if (removed) {
        const game = await getGameByID(id, instance);

        await runSignupHooks('onLeave', game, options.id, instance);
    }

    return true;
}

async function runSignupHooks(hook: 'onSignup' | 'onLeave', game: Signups, id: string, instance: Instance) {
    // Imported lazily to avoid a circular import (extensions load files that import this module).
    const { getExtensions } = await import("../extensions");

    const extensions = getExtensions(game.extensions ?? []);

    const results = await Promise.allSettled(extensions.map(extension => extension[hook]?.(instance, game, id)));

    const fails = results.filter(result => result.status == "rejected") as PromiseRejectedResult[];

    if (fails.length > 0) {
        console.log(fails);

        // Report to mods instead of failing the player's signup/leave.
        const gameSetup = await getGameSetup(game, instance.setup);

        await gameSetup.spec.send("Signup extension error for <@" + id + ">:\n" + fails.map(fail => String(fail.reason)).join("\n")).catch(() => {});
    }
}

export async function openSignups(name: string, instance: Instance) {
    const game = await getGameByName(name, instance);
    if (game == null) throw new Error("Game not found.");
    if (await isGameStarted(instance, game.id)) throw new Error("Game has already started, signups are closed.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(game.id);

    await ref.update({
        closed: false,
    })
}

export async function closeSignups(name: string, instance: Instance) {
    const game = await getGameByName(name, instance);
    if (game == null) throw new Error("Game not found.")
    if (await isGameStarted(instance, game.id)) throw new Error("Game has already started, signups are closed.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(game.id);

    await ref.update({
        closed: true,
    })
}

async function fetchSignupMessage(signup: { id: string, channel?: string }, instance: Instance) {
    const channel = signup.channel ? await client.channels.fetch(signup.channel) : instance.setup.primary.chat;

    if (channel == null || !channel.isTextBased()) throw new Error("Signup channel not found.");

    return await channel.messages.fetch(signup.id);
}

export async function activateSignup(options: { id: string, channel: string, name: string }, instance: Instance) {
    const game = await getGameByName(options.name, instance);

    if (game == null) throw new Error("Game not found.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(game.id);

    const signup = game.message;

    await ref.update({
        message: {
            id: options.id,
            channel: options.channel,
        }
    })

    refreshSignup(options.name, instance);

    if (signup) {
        const setup = instance.setup;

        if (typeof setup == 'string') throw new Error("Setup incomplete.");

        let message = await fetchSignupMessage(signup, instance).catch(() => { return undefined; });

        if (!message || !message.editable) return;

        const embed = new EmbedBuilder()
            .setTitle("Signups for " + game.name + "!")
            .setColor(Colors.Red)
            .setDescription("This sign up message has been deactivated.")

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "reactivate", game: game.name }))
                    .setLabel("Reactivate")
                    .setStyle(ButtonStyle.Danger)
            ])

        await message.edit({
            embeds: [embed],
            components: [row]
        });
    }
}

export async function refreshSignup(name: string, instance: Instance) {
    const game = await getGameByName(name, instance);
    const setup = instance.setup;

    if (typeof setup == 'string') throw new Error("Setup Incomplete");
    if (game == null) throw new Error("Game not found.");
    if (game.message == null) return;

    let message = await fetchSignupMessage(game.message, instance);

    if (!message || !message.editable) return;

    let list = "";

    for (let i = 0; i < game.signups.length; i++) {
        const user = await getUser(game.signups[i], instance);

        if (user) {
            list += user.nickname + "\n";
        } else {
            list += "<@" + game.signups[i] + ">" + "\n";
        }
    }

    const embed = new EmbedBuilder()
        .setTitle("Signups for " + game.name + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription((game.signups.length == 0 ? "No signups.\n" : list) + "\nSign up by using the **/signup** command!");
    if(game.signups.length > 0) {
        embed.setFooter({ text: (game.signups.length > 1 ? game.signups.length + " players have signed up already." : "1 player has signed up already." ) });
    }

    await message.suppressEmbeds(false); // in case embeds were suppressed

    await message.edit({
        embeds: [embed],
        components: [],
    });
}


export async function archiveGame(interaction: ChatInputCommandInteraction | TextCommand, name: string, instance: Instance) {
    const setup = instance.setup;
    const game = await getGameByName(name, instance, true);
    if (typeof setup == 'string') throw new Error("Setup Incomplete");
    if (game == null) throw new Error("Game not found.");
    if (await isGameStarted(instance, game.id)) throw new Error("Game in progress.");

    const spec = await setup.secondary.guild.channels.fetch(game.channels.spec).catch(() => undefined);
    if (spec != undefined && spec.type == ChannelType.GuildText) await spec.setParent(setup.secondary.archive, { lockPermissions: true });

    const mafia = await setup.tertiary.guild.channels.fetch(game.channels.mafia).catch(() => undefined);
    if (mafia != undefined && mafia.type == ChannelType.GuildText) await mafia.setParent(setup.tertiary.archive, { lockPermissions: true });

    // A main chat the bot made is kept for its history but made read-only. One the mod supplied is left alone.
    if (game.channels.main && game.channels.mainCreated) {
        const main = await setup.primary.guild.channels.fetch(game.channels.main).catch(() => undefined);
        if (main != undefined && main.type == ChannelType.GuildText) await setChatPermissions(main, setup.primary.alive, setup.primary.gang, true);
    }

    if (game.roles?.alive) {
        const alive = await setup.primary.guild.roles.fetch(game.roles.alive).catch(() => undefined);
        if (alive) await alive.delete("Game archived");
    }

    // The game's dm category: archive anything still in it, then remove the empty category.
    if (game.channels.dms) {
        const dms = await setup.secondary.guild.channels.fetch(game.channels.dms).catch(() => undefined);

        if (dms != undefined && dms.type == ChannelType.GuildCategory) {
            await Promise.allSettled(dms.children.cache.map(channel => channel.setParent(setup.secondary.archivedDms, { lockPermissions: true })));
            await dms.delete("Game archived");
        }
    }

    await interaction.reply({ ephemeral: true, content: "Game archived." });
}

export async function createGame(interaction: ChatInputCommandInteraction | TextCommand, name: string, instance: Instance, existingChat?: string | null) {
    const setup = instance.setup;

    if (typeof setup == 'string') throw new Error("Setup Incomplete");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games');

    const exists = await getGameByName(name, instance, true).catch(() => { return undefined; });

    if (exists) throw new Error("Duplicate game names not allowed.");

    const requirements = z.string().min(1, "Minimum 1 character.").max(20, "Max length 20 characters.").regex(/^[a-zA-Z0-9 ]*$/, "Only letters, numbers, and spaces allowed.");

    const check = requirements.safeParse(name);

    if (!check.success) {
        throw new Error("Name Error - " + check.error.flatten().formErrors.join(" "));
    }

    if (interaction.type != 'text') await interaction.deferReply({ ephemeral: true });

    // Main chat and alive role first, so a bad existing channel fails before anything else is made.
    const { main, mainCreated, alive } = await createGameChat(instance, name, existingChat);
    const dms = await createGameDms(instance, name);

    const spec = await setup.secondary.ongoing.children.create({
        type: ChannelType.GuildText,
        name: name.toLowerCase() + "-spectator",
        position: 0,
    });

    const mafia = await setup.tertiary.ongoing.children.create({
        type: ChannelType.GuildText,
        name: name.toLowerCase() + "-mafia",
        position: 0,
    });


    await ref.add({
        signups: [],
        name: name,
        closed: false,
        message: null,
        confirmations: [],
        channels: {
            spec: spec.id,
            mafia: mafia.id,
            main: main.id,
            mainCreated: mainCreated,
            dms: dms.id,
        },
        roles: {
            alive: alive.id,
        },
        days: 0,
        alignments: [],
        winners: [],
        losers: [],
        links: [],
        state: 'active',
        pinned: null,
        mods: [],
        extensions: [],
        hammer: true,
        start: null,
        end: null,
    } satisfies Omit<Signups, "id">);

    // Start tracking the new main chat right away. Imported lazily: context imports this module.
    (await import("./context")).clearMainChatCache(instance);

    await register();

    if (interaction.type != 'text') {
        await interaction.editReply({ content: name + " game created. Main chat: " + main.url })
    } else {
        await interaction.reply({ content: name + " game created. Main chat: " + main.url })
    }
}

// Creates a game's alive role and main chat (or adopts an existing primary channel), opened with pregame permissions.
// Used by /mod create and by ?adv convert for games made before per-game main chats.
export async function createGameChat(instance: Instance, name: string, existingChat?: string | null) {
    const setup = instance.setup;

    // An existing channel must be checked before anything is made.
    let existing: TextChannel | undefined = undefined;

    if (existingChat) {
        const channel = await setup.primary.guild.channels.fetch(existingChat).catch(() => null);

        if (channel == null || channel.type != ChannelType.GuildText) throw new Error("Main chat must be a text channel in the main server.");

        existing = channel;
    }

    // Each game gets its own alive role (pings, send access in its main chat), styled like the server's alive role.
    const alive = await setup.primary.guild.roles.create({
        name: name + " Alive",
        color: setup.primary.alive.color,
        hoist: setup.primary.alive.hoist,
        mentionable: true,
        permissions: [],
        position: setup.primary.alive.position,
    });

    // Otherwise a new channel next to the server's main chat with the same permissions (the server alive role swapped for this game's).
    const main = existing ?? await setup.primary.guild.channels.create({
        type: ChannelType.GuildText,
        name: name.toLowerCase().replaceAll(" ", "-") + "-main",
        parent: setup.primary.chat.parentId,
        position: setup.primary.chat.position + 1,
        permissionOverwrites: setup.primary.chat.permissionOverwrites.cache
            .filter(overwrite => overwrite.id != setup.primary.alive.id)
            .map(overwrite => ({ id: overwrite.id, type: overwrite.type, allow: overwrite.allow, deny: overwrite.deny })),
    });

    await setChatPermissions(main, alive, setup.primary.gang, false);

    return { main, mainCreated: existing == undefined, alive };
}

// A game's dm category in the dead chat server, next to the server's dms category and with its permissions (spectator view,
// @everyone hidden). Players' dm channels move in for the game and are archived out at the end. One per game also keeps
// each category under Discord's 50 channel limit.
export async function createGameDms(instance: Instance, name: string) {
    const setup = instance.setup;

    return await setup.secondary.guild.channels.create({
        type: ChannelType.GuildCategory,
        name: name + " DMs",
        position: setup.secondary.dms.position,
        permissionOverwrites: setup.secondary.dms.permissionOverwrites.cache
            .filter(overwrite => overwrite.type == OverwriteType.Role)
            .map(overwrite => ({ id: overwrite.id, type: overwrite.type, allow: overwrite.allow, deny: overwrite.deny })),
    });
}

// Main chat permissions for a game's alive role and the server's gang role. Locked: alive players can't talk and everyone
// else can only watch. Unlocked: alive players can talk, and outside a game (alive role empty) the gang can chat freely.
export async function setChatPermissions(main: TextChannel, alive: Role, gang: Role, lock: boolean) {
    await main.permissionOverwrites.create(alive.id, {});

    await main.permissionOverwrites.create(gang.id, {
        ViewChannel: true,
        SendMessages: !lock,
        AddReactions: true,
        AttachFiles: !lock,
        EmbedLinks: !lock,
        SendVoiceMessages: !lock,
        UseExternalEmojis: true,
        UseApplicationCommands: !lock,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false
    });
}

export type GameSetup = Awaited<ReturnType<typeof getGameSetup>>

export async function getGameSetup(game: Signups, setup: Exclude<Awaited<ReturnType<typeof getSetup>>, string>) {
    const db = firebaseAdmin.getFirestore();

    const spec = await setup.secondary.guild.channels.fetch(game.channels.spec).catch(() => undefined);
    const mafia = await setup.tertiary.guild.channels.fetch(game.channels.mafia).catch(() => undefined);

    // Older games have no main chat or alive role of their own and keep using the server's.
    const main = game.channels.main ? await setup.primary.guild.channels.fetch(game.channels.main).catch(() => undefined) : setup.primary.chat;
    const alive = game.roles?.alive ? await setup.primary.guild.roles.fetch(game.roles.alive).catch(() => undefined) : setup.primary.alive;
    const dms = game.channels.dms ? await setup.secondary.guild.channels.fetch(game.channels.dms).catch(() => undefined) : setup.secondary.dms;

    if (spec == undefined || mafia == undefined || main == undefined || alive == undefined || dms == undefined || dms.type != ChannelType.GuildCategory) throw new Error("Game Setup Incomplete");

    return { spec: spec as TextChannel, mafia: mafia as TextChannel, main: main as TextChannel, alive: alive as Role, dms: dms as CategoryChannel };
}

function getRandom(min: number, max: number) {
    return Math.floor((Math.random() * (max - min) + min)).toString();
}

// A user can't play in any active game while modding one, and can't be assigned as a mod while signed up for one.
export async function checkModPlayConflict(id: string, as: 'player' | 'mod', instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const docs = (await db.collection('instances').doc(instance.id).collection('games').where('state', '==', 'active').get()).docs;

    for (const doc of docs) {
        const data = doc.data();

        if (as == 'player' && ((data.mods ?? []) as string[]).includes(id)) throw new Error("<@" + id + "> is modding " + data.name + " and can't play in a game while modding.");
        if (as == 'mod' && ((data.signups ?? []) as string[]).includes(id)) throw new Error("<@" + id + "> is signed up for " + data.name + " and can't mod while playing.");
    }
}

export async function getGames(instance: Instance, allowCompleted: boolean = false) {
    const db = firebaseAdmin.getFirestore();

    let query = db.collection('instances').doc(instance.id).collection('games') as Query;
    if (allowCompleted === false) query = query.where('state', '==', 'active');
    const docs = (await query.get()).docs;

    const games = [] as { name: string, id: string }[];

    for (let doc = 0; doc < docs.length; doc++) {
        const data = docs[doc].data();

        if (!data) continue;

        games.push({
            name: data.name,
            id: docs[doc].id,
        })
    };

    return games;
}

export async function getGameByName(name: string, instance: Instance, allowCompleted: boolean = false) {
    const db = firebaseAdmin.getFirestore();

    let query = db.collection('instances').doc(instance.id).collection('games') as Query;
    if (allowCompleted === false) query = query.where('state', '==', 'active');
    const docs = (await query.get()).docs;
    const games = docs.map(doc => doc.data());

    for (let i = 0; i < games.length; i++) {
        if (games[i].name.toLowerCase() == name.toLowerCase()) {
            return { ...games[i], id: docs[i].id } as Signups;
        }
    }

    throw new Error("Game not found in database.");
}

export async function getGameByID(id: string, instance: Instance, allowCompleted: boolean = false) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(id);

    const doc = (await ref.get());

    if (doc.data() == undefined) throw new Error("Game not found in database.");
    if (allowCompleted === false && doc.data()?.state != 'active') throw new Error("Game completed!");

    return { ...doc.data(), id: doc.id } as Signups;
}

// The game a config command (extensions, hammer) acts on: the named game, else the running game that owns the channel
// (or the only running game). With an event, its replies are labelled with the game.
export async function resolveGame(name: string | null | undefined, instance: Instance, event?: any) {
    // Imported lazily: context imports this module.
    const { channelOf, findRunningGame, labelReplies } = await import("./context");

    const game = name ? await getGameByName(name, instance) : (await findRunningGame(instance, channelOf(event)))?.game;

    if (game == undefined) throw new Error("No game picked. Specify a game, or run this in a running game's channels.");

    if (event) labelReplies(event, game.name);

    return game;
}

export function gameRef(instance: Instance, id: string) {
    return firebaseAdmin.getFirestore().collection('instances').doc(instance.id).collection('games').doc(id);
}

export async function getGameID(name: string, instance: Instance, allowCompleted: boolean = false) {
    const game = await getGameByName(name, instance, allowCompleted);

    if (game == null) return null;

    return game.id;
}
