import { EmbedBuilder } from "@discordjs/builders";
import Discord, { ButtonInteraction, ChannelType, ChatInputCommandInteraction, Colors, GuildMember, OverwriteType, PermissionsBitField, TextChannel } from "discord.js";
import { CollectionReference, DocumentSnapshot, Firestore, Query } from "firebase-admin/firestore";
import client from "../../discord/client";
import { removeReactions } from "../../discord/helpers";
import { type TextCommand } from '../../discord';
import { getExtensions } from "../extensions";
import { firebaseAdmin } from "../firebase";
import { clearFiles } from "../google/doc";
import { type Setup } from "../setup";
import { GameSetup, Signups, getGameByID, getGameByName, getGameSetup, refreshSignup, setChatPermissions } from "./games";
import { onjoin } from "./invite";
import { User, getPlayerObjects, getUser, getUsersArray } from "./user";
import { Instance } from "../instance";
import { createGameState, isAliveAnywhere, isGameStarted, settingsRef, stateRef } from "./state";
import { findRunningGame, getGameContext, getRunningGame, updateCachedContext, clearCachedContext, type GameContext } from "./context";
import { pruneRoleQueue } from "./invite";

const pings = true;

export interface Player {
    id: string,
    alignment: 'mafia' | 'neutral' | string | null;
}

export function generateOverwrites(id: string) {
    return [
        {
            id: id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.AddReactions, 
                PermissionsBitField.Flags.AttachFiles, 
                PermissionsBitField.Flags.EmbedLinks, 
                //PermissionsBitField.Flags.SendPolls, 
                PermissionsBitField.Flags.SendVoiceMessages,
                PermissionsBitField.Flags.UseExternalEmojis,
                PermissionsBitField.Flags.UseApplicationCommands,
            ],
            deny: [
                PermissionsBitField.Flags.SendTTSMessages
            ]
        }
    ] 
}

export function editOverwrites() {
    return {
        ViewChannel: true,
        SendMessages: true,
        AddReactions: true, 
        AttachFiles: true, 
        EmbedLinks: true, 
        SendPolls: true, 
        SendVoiceMessages: true,
        UseExternalEmojis: true,
        SendTTSMessages: false,
        UseApplicationCommands: true,
        PinMessages: true,
    }
}

export function viewOverwrites() {
    return {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false, 
        AttachFiles: false, 
        EmbedLinks: false, 
        SendPolls: false, 
        SendVoiceMessages: false,
        UseExternalEmojis: false,
        SendTTSMessages: false,
        UseApplicationCommands: false,
        PinMessages: false,
    }
}

export async function unlockExtensions(ctx: GameContext, increment: boolean) {
    const extensions = getExtensions(ctx.state.extensions);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onUnlock(ctx, increment)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function unlockGame(ctx: GameContext, increment: boolean = false, ping: boolean = true) {
    const { instance, game, state: global } = ctx;
    const setup = instance.setup;
    const { main, alive } = ctx.gameSetup;

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) return await main.send("Failed to unlock channel, game has not started.");
    if(!global.locked) throw new Error("Already unlocked.");

    await main.permissionOverwrites.create(alive.id, {
        SendMessages: true,
        AddReactions: true, 
        AttachFiles: true, 
        EmbedLinks: true, 
        //SendPolls: true, 
        SendVoiceMessages: true,
        UseExternalEmojis: true,
        SendTTSMessages: false,
        UseApplicationCommands: true,
    });

    await main.permissionOverwrites.create(setup.primary.gang.id, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: true,
        AttachFiles: false,
        EmbedLinks: false,
        //SendPolls: false,
        SendVoiceMessages: false,
        UseExternalEmojis: true,
        UseApplicationCommands: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false, 
        SendMessagesInThreads: false
    });

    const db = firebaseAdmin.getFirestore();

    const ref = stateRef(instance, game.id);

    const day = increment ? global.day + 1 : global.day;

    await ref.update({
        started: true,
        locked: false,
        day: day,
    });

    global.locked = false;
    global.day = day;
    updateCachedContext(ctx);

    await db.collection('instances').doc(instance.id).collection('games').doc(game.id).collection('days').doc(day.toString()).set({
        game: game.id,
    }, { merge: true });

    const message = await main.send((pings && ping ? "<@&" + alive.id + ">" : "") + " Game has unlocked!");

    if(increment == true) {
        await db.collection('instances').doc(instance.id).collection('games').doc(game.id).collection('days').doc(day.toString()).set({
            game: game.id,
            players: global.players.map((player) => player.id),
            start: message.createdTimestamp,
        });
    }

    await unlockExtensions(ctx, increment);
}

export async function lockExtensions(ctx: GameContext) {
    const extensions = getExtensions(ctx.state.extensions);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onLock(ctx)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function lockGame(ctx: GameContext) {
    const { instance, game, state: global } = ctx;
    const setup = instance.setup;
    const { main, alive } = ctx.gameSetup;

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) throw new Error("Failed to unlock channel, game has not started.");
    if(global.locked) throw new Error("Already locked.");

    await main.permissionOverwrites.create(alive.id, {});

    await main.permissionOverwrites.create(setup.primary.gang.id, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: true,
        AttachFiles: false,
        EmbedLinks: false,
        //SendPolls: false,
        SendVoiceMessages: false,
        UseExternalEmojis: true,
        UseApplicationCommands: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false, 
        SendMessagesInThreads: false
    });

    const db = firebaseAdmin.getFirestore();

    const ref = stateRef(instance, game.id);

    await ref.update({
        started: true,
        locked: true,
    });

    global.locked = true;
    updateCachedContext(ctx);

    await main.send("Game has locked!");

    await lockExtensions(ctx);
}

export async function checkSignups(signups: string[], setup: Setup) { //probably could be optimized in a better way but who cares :)
    const promises = [] as Promise<any>[];

    for(let i = 0; i < signups.length; i++) { //chances someone is not the server is not zero (cough cough someone cough), check here to prevent game from starting if there is someone missing
        const id = signups[i];
        
        promises.push((async () => {
            const player = await setup.primary.guild.members.fetch(id).catch(() => undefined);
            if(player == null) throw new Error("Member not found. <@" + id + ">");
        })())
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function deleteInvites(setup: Setup) {
    const invites = Array.from(await setup.tertiary.guild.invites.fetch());

    const promises = [] as Promise<any>[];

    for(let i = 0; i < invites.length; i++) {
        if(invites[i][1].deletable) {
            promises.push(invites[i][1].delete());
        }
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function prepareGame(game: Signups, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const state = {
        started: true,
        locked: true,
        players: game.signups.map((signup) => { return { id: signup, alignment: null } }),
        day: 0,
        grace: false,
    }

    await createGameState(instance, game.id, state);
    await settingsRef(instance).update({ game: game.id });

    instance.global = { ...instance.global, game: game.id };
}

export async function finishSignups(game: Signups, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(game.id);

    await ref.update({
        closed: true,
    })

    await refreshSignup(game.name, instance);
}

export async function setupPermissions(setup: Setup, gameSetup: GameSetup, lock: boolean) {
    await setChatPermissions(gameSetup.main, gameSetup.alive, setup.primary.gang, lock);
}

export async function setupDeadPlayer(player: Discord.GuildMember | undefined, setup: Setup) {
    if(player != undefined) {
        await player.roles.remove(setup.secondary.mod);
        await player.roles.remove(setup.secondary.spec);
    }
}

export async function setupMainPlayer(player: Discord.GuildMember, setup: Setup, gameSetup: GameSetup) {
    await player.roles.add(gameSetup.alive);
    await player.roles.remove(setup.primary.mod);
}

export async function setupMafiaPlayer(mafiaPlayer: GuildMember | undefined, setup: Setup, gameSetup: GameSetup) {
    if(mafiaPlayer?.joinedTimestamp) {
        await mafiaPlayer.roles.remove(setup.tertiary.mod);
        await mafiaPlayer.roles.remove(setup.tertiary.spec);
        await mafiaPlayer.roles.remove(setup.tertiary.access);
    }
}

// Mafia chat access is a member permission overwrite on the game's mafia channel only. Never put member overwrites on the shared
// tertiary ongoing category: anyone who can view one of its channels receives its overwrite list, which would expose other games' mafia.
export async function grantMafiaAccess(id: string, setup: Setup, mafia: TextChannel) {
    await mafia.permissionOverwrites.edit(id, editOverwrites(), { type: OverwriteType.Member });
}

// Also removes any legacy member overwrite on the category from before access was per channel.
export async function revokeMafiaAccess(id: string, setup: Setup, mafia: TextChannel | undefined) {
    if(setup.tertiary.ongoing.permissionOverwrites.cache.has(id)) await setup.tertiary.ongoing.permissionOverwrites.delete(id);
    if(mafia?.permissionOverwrites.cache.has(id)) await mafia.permissionOverwrites.delete(id);
}

export async function clearMafiaAccess(setup: Setup, gameSetup: GameSetup) {
    const channels = [ setup.tertiary.ongoing, gameSetup.mafia ];

    for(const channel of channels) {
        const members = channel.permissionOverwrites.cache.filter(overwrite => overwrite.type == OverwriteType.Member);

        await Promise.all(members.map(overwrite => overwrite.delete()));
    }
}

async function setTag(userProfile: User, player: GuildMember) {
    const db = firebaseAdmin.getFirestore();

    await db.collection('tags').doc(player.id).set({
        id: player.id,
        color: player.displayHexColor,
        nickname: userProfile.nickname,
        pfp: player.avatarURL() ?? player.displayAvatarURL() ?? client.user?.displayAvatarURL() ?? "https://cdn.discordapp.com/avatars/1248187665548054588/cc206768cd2ecf8dfe96c1b047caa60f.webp?size=160"
    });
}

export async function setupPlayer(id: string, ctx: GameContext) {
    const { instance, gameSetup } = ctx;
    const setup = instance.setup;

    const db = firebaseAdmin.getFirestore();

    const { deadPlayer, userProfile, player, mafiaPlayer } = await getPlayerObjects(id, instance);

    if(player) await setupMainPlayer(player, setup, gameSetup);
    await setupDeadPlayer(deadPlayer, setup)
    await setupMafiaPlayer(mafiaPlayer, setup, gameSetup);
    if(player) await setTag(userProfile, player);

    let channel = await setup.secondary.guild.channels.fetch(userProfile.channel ?? "").catch(() => null);
    let newPlayer = channel == null;

    if(channel == null || channel.type != ChannelType.GuildText) {
        channel = await setup.secondary.guild.channels.create({ 
            parent: setup.secondary.dms, 
            name: userProfile.nickname.toLowerCase()
        });

        await db.collection('instances').doc(instance.id).collection('users').doc(userProfile.id).update({
            channel: channel.id,
        });
    } else {
        await channel.setName(userProfile.nickname.toLowerCase());
    }

    if(channel.parentId != setup.secondary.dms.id) {
        await channel.setParent(setup.secondary.dms.id);
    } else {
        await channel.permissionOverwrites.edit(setup.secondary.spec.id, viewOverwrites());
    }

    if(!deadPlayer) {
        const invite = await setup.secondary.guild.invites.create(channel, { unique: true });

        await onjoin({
            id: userProfile.id,
            server: "secondary",
            roles: {},
            permissions: {
                channel: channel.id,
            },
            message: {
                channel: channel.id,
                content: "Welcome <@" + userProfile.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod."
            },
            game: ctx.game.id,
        }, instance);

        const dm = await client.users.cache.get(id)?.createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to " + userProfile.nickname + ".");

        if(pings) {
            await dm.send("Join the Dead Chat server to play in mafia! Here's a server invite: \nhttps://discord.com/invite/" + invite.code);
        }
    } else if(newPlayer) {
        await channel.permissionOverwrites.create(userProfile.id, editOverwrites());

        channel.send("Welcome <@" + userProfile.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod.");
    } else {
        await channel.permissionOverwrites.create(userProfile.id, editOverwrites());
    }
}

export async function startExtensions(ctx: GameContext) {
    const extensions = getExtensions(ctx.state.extensions);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onStart(ctx)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function startGame(interaction: ChatInputCommandInteraction | TextCommand | ButtonInteraction, name: string, instance: Instance) {
    if(interaction.type != 'text') {
        await interaction.deferReply({ ephemeral: true });
    } else {
        await interaction.message.react("<a:loading:1256150236112621578>");
    }

    if(await findRunningGame(instance)) throw new Error("Game has already started.");

    const game = await getGameByName(name, instance);
    const setup = instance.setup;
    const db = firebaseAdmin.getFirestore();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(game == null) throw new Error("Game not found.");
    if(game.signups.length == 0) throw new Error("Game must have more than one player.");

    const gameSetup = await getGameSetup(game, setup);

    await checkSignups(game.signups, setup);

    await prepareGame(game, instance);

    const ctx = await getGameContext(instance, game.id);

    //at this point, things have been checked and accounted for and we can do multiple things at once now!

    const promises = [] as Promise<unknown>[];

    promises.push((async () => {
        const db = firebaseAdmin.getFirestore();

        const days = await db.collection('instances').doc(instance.id).collection('games').doc(game.id).collection('days').listDocuments();

        for(let i = 0; i < days.length; i++) {
            const dayDoc = db.collection('instances').doc(instance.id).collection('games').doc(game.id).collection('days').doc((days[i].id).toString());

            await deleteCollection(db, dayDoc.collection('votes'), 20);
            await deleteCollection(db, dayDoc.collection('players'), 20);
            await dayDoc.delete();
        }  
    })());

    promises.push(pruneRoleQueue(instance));
    promises.push(deleteInvites(setup));
    promises.push(clearMafiaAccess(setup, gameSetup));
    promises.push(finishSignups(game, instance));
    promises.push(setupPermissions(setup, ctx.gameSetup, true));
    promises.push(startExtensions(ctx));
    promises.push(setup.secondary.dms.permissionOverwrites.edit(setup.secondary.spec.id, viewOverwrites()));

    for(let i = 0; i < game.signups.length; i++) {
        promises.push(setupPlayer(game.signups[i], ctx));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");
    
    if(fails.length > 0) {
        console.log(fails);

        const embed = new EmbedBuilder()
            .setTitle("Game Start Failed")
            .setColor(Colors.Red)
            .setDescription(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""))

        await ctx.gameSetup.main.send((pings ? "<@&" + ctx.gameSetup.alive.id + "> " : "") + ":warning: Game has locked (mods, check errors).");

        if(interaction.type != 'text') {
            return await interaction.editReply({ embeds: [embed] });
        } else {
            await removeReactions(interaction.message);

            return await interaction.reply({ embeds: [embed] });
        }
    }

    const message = await ctx.gameSetup.main.send((pings ? "<@&" + ctx.gameSetup.alive.id + "> " : "") + "Game has locked!");

    await markGame(game.start ? undefined : message.createdTimestamp, game.id, instance, 'start');

    if(interaction.type != 'text') {
        await interaction.editReply({ content: "Game is starting!" });
    } else {
        await removeReactions(interaction.message);

        await interaction.message.react("✅")
    }

    //await startLog(setup, ctx, instance);
}

export async function markGame(timestamp: number | undefined, gameId: string, instance: Instance, type: 'start' | 'end') {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(gameId);

    await ref.update({
        ...(timestamp != undefined && { [type]: timestamp }),
        state: type == 'end' ? 'completed' : undefined,
    });
}

export async function startLog(setup: Setup, ctx: GameContext, instance: Instance) {
    const game = ctx.game;
    const users = await getUsersArray(game.signups, instance);

    const embed = new EmbedBuilder()
        .setTitle('Game Started')
        .setFields([
            {
                name: "Players",
                value: users.map(user => user.nickname).join("\n"),
                inline: true,
            },
            {
                name: "Extensions",
                value: ctx.state.extensions.join("\n"),
                inline: true,
            },
            {
                name: "GM",
                value: setup.primary.mod.members.map(member => "<@" + member.id + ">").join("\n"),
                inline: true,
            },
        ])
        .setColor(Colors.Orange);

    const secondaryEmbed = new EmbedBuilder()
        .setTitle('Secondary Server - dead chat')
        .setFields([
            {
                name: "Members",
                value: setup.secondary.guild.members.cache.map(member => "<@" + member.id + ">").join("\n"),
                inline: true,
            },
            {
                name: "Spectator",
                value: setup.secondary.spec.members.map(member => "<@" + member.id + ">").join("\n"),
                inline: true,
            },
            {
                name: "GM",
                value: setup.secondary.mod.members.map(member => "<@" + member.id + ">").join("\n"),
                inline: true,
            }
        ])
        .setColor(Colors.Orange);
    
    const tertiaryEmbed = new EmbedBuilder()
        .setTitle('Tertiary Server - mafia chat')
        .setFields([
            {
                name: "Members",
                value: setup.tertiary.guild.members.cache.map(member => "<@" + member.id + ">").join("\n"),
                inline: true,
            },
            {
                name: "Spectator",
                value: setup.tertiary.spec.members.map(member => "<@" + member.id + ">").join("\n"),
                inline: true,
            },
            {
                name: "GM",
                value: setup.tertiary.mod.members.map(member => "<@" + member.id + ">").join("\n"),
                inline: true,
            }
        ])
        .setColor(Colors.Orange);

    await setup.secondary.logs.send({ embeds: [ embed ] });
    await setup.secondary.logs.send({ embeds: [ secondaryEmbed ] });
    await setup.secondary.logs.send({ embeds: [ tertiaryEmbed ] });
}

export async function clearGame(ctx: GameContext) {
    const { instance, game, state } = ctx;
    const db = firebaseAdmin.getFirestore();

    // The game's state doc is kept (with started: false) as a record of how it ended.
    await stateRef(instance, game.id).update({ started: false, locked: false });

    state.started = false;
    state.locked = false;
    clearCachedContext(instance, game.id);

    if(instance.global.game == game.id) {
        await settingsRef(instance).update({ game: null });
    }

    const gameRef = db.collection('instances').doc(instance.id).collection('games').doc(game.id);

    await gameRef.update({
        state: "completed",
        days: state.day,
    } satisfies Partial<Signups>)
}

// Moves the given players' dm channels to the archive. DM channels are one per player across games, so a channel stays
// open while its player is signed up for another started game (exceptGame is the game being ended/reverted).
export async function archiveChannels(instance: Instance, ids: string[], exceptGame?: string) {
    const setup = instance.setup;

    const busy = await getStartedSignups(instance, exceptGame);

    const promises = [] as Promise<any>[];

    for(const id of ids) {
        if(busy.has(id)) continue;

        promises.push((async () => {
            const user = await getUser(id, instance);
            if(user?.channel == null) return;

            const channel = await setup.secondary.guild.channels.fetch(user.channel).catch(() => null);
            if(channel == null || channel.type != ChannelType.GuildText || channel.parentId != setup.secondary.dms.id) return;

            await channel.setParent(setup.secondary.archivedDms, { lockPermissions: true });
        })());
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

// Everyone signed up for a started game other than exceptGame.
async function getStartedSignups(instance: Instance, exceptGame?: string) {
    const db = firebaseAdmin.getFirestore();

    const games = (await db.collection('instances').doc(instance.id).collection('games').where('state', '==', 'active').get()).docs.filter(doc => doc.id != exceptGame);

    const started = await Promise.all(games.map(async doc => (await isGameStarted(instance, doc.id)) ? (doc.data().signups ?? []) as string[] : []));

    return new Set(started.flat());
}

export async function setMafiaSpectator(mafiaPlayer: GuildMember | undefined, id: string, userProfile: User, ctx: GameContext, dm: boolean = true) {
    const { instance, gameSetup } = ctx;
    const setup = instance.setup;

    const spectate = !(await isAliveAnywhere(id, instance, ctx.game.id));
    
    if(mafiaPlayer) {
        await revokeMafiaAccess(mafiaPlayer.id, setup, gameSetup.mafia);

        if(spectate) {
            await mafiaPlayer.roles.add(setup.tertiary.spec);
            await mafiaPlayer.roles.remove(setup.tertiary.access);
        }
    } else if(dm && spectate) {
        const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia.id, { unique: true });

        await onjoin({
            id: userProfile.id,
            server: "tertiary",
            roles: {
                add: ["spectator"],
                remove: ["access"],
            },
            game: ctx.game.id,
        }, instance);
            
        const dm = await client.users.cache.get(id)?.createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to " + userProfile.nickname + ".");

        if(pings) {
            await dm.send("Here's a server invite to spectate mafia chat: \nhttps://discord.com/invite/" + invite.code);
        }
    }
}

export async function clearPlayer(id: string, ctx: GameContext) {
    const { instance } = ctx;
    const setup = instance.setup;

    const promises = [] as Promise<any>[];

    const { deadPlayer, userProfile, player, mafiaPlayer } = await getPlayerObjects(id, instance);

    if(player) promises.push(player.roles.remove(ctx.gameSetup.alive));

    if(deadPlayer && !(await isAliveAnywhere(id, instance, ctx.game.id))) {
        promises.push(deadPlayer.roles.add(setup.secondary.spec));
    }

    promises.push(setMafiaSpectator(mafiaPlayer, id, userProfile, ctx, true));

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function endExtensions(ctx: GameContext) {
    const extensions = getExtensions(ctx.state.extensions);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onEnd(ctx)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function endGame(interaction: ChatInputCommandInteraction | TextCommand, instance: Instance) {
    if(interaction.type != 'text') {
        await interaction.deferReply({ ephemeral: true });
    } else {
        await interaction.message.react("<a:loading:1256150236112621578>");
    }

    const ctx = await getRunningGame(instance);
    const { game } = ctx;
    const setup = instance.setup;
    
    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred." );

    //await checkSignups(game.signups, setup);

    await clearGame(ctx);

    const promises = [] as Promise<unknown>[];

    promises.push((async () => {
        const message = await ctx.gameSetup.main.send((pings ? "<@&" + ctx.gameSetup.alive.id + "> " : "") + "Game has ended!");

        await markGame(message.createdTimestamp, game.id, instance, 'end');
    })())
    
    promises.push(setupPermissions(setup, ctx.gameSetup, false));
    promises.push(archiveChannels(instance, game.signups, game.id));
    promises.push(endExtensions(ctx));
    promises.push(clearFiles());

    for(let i = 0; i < game.signups.length; i++) {
        promises.push(clearPlayer(game.signups[i], ctx));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        const embed = new EmbedBuilder()
            .setTitle("Game End Failed")
            .setColor(Colors.Red)
            .setDescription(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""))

        if(interaction.type != 'text') {
            return await interaction.editReply({ embeds: [embed] });
        } else {
            return await interaction.reply({ embeds: [embed] });
        }
    }

    if(interaction.type != 'text') {
        return await interaction.editReply({ content: "Game has ended!" });
    } else {
        await removeReactions(interaction.message);

        await interaction.message.react("✅");
    }
}

export async function editPlayer(options: { id: string, alignment: 'mafia' | null }, ctx: GameContext) {
    const db = firebaseAdmin.getFirestore();

    const ref = stateRef(ctx.instance, ctx.game.id);

    await db.runTransaction(async t => {
        const global = ctx.state;

        const player = global.players.find((value) => { value.id == options.id });

        if(player) {
            player.alignment = options.alignment;
        }

        t.update(ref, {
            players: global.players
        })
    })
}


// Deletes the first page repeatedly until the collection is empty. Paging with an offset while deleting skipped
// documents, since every deleted page shifts the rest up and the next offset jumps past them.
export async function deleteCollection(db: Firestore, collection: CollectionReference, batchSize: number) {
    const query = collection.orderBy('__name__').limit(batchSize);

    while(true) {
        const deleted = await deleteQueryBatch(db, query, batchSize);

        if(deleted < batchSize) return;
    }
}

async function deleteQueryBatch(db: Firestore, query: Query, batchSize: number) {
    const docs = (await query.get()).docs;

    if(docs.length == 0) return 0;

    let toDelete = [] as DocumentSnapshot[];

    for(let i = 0; i < docs.length; i++) {
        const doc = docs[i].ref;

        const collections = await doc.listCollections();

        for(let j = 0; j < collections.length; j++) {
            await deleteCollection(db, collections[j], batchSize);

            await tick();
        }

        toDelete.push(docs[i]);

        if(toDelete.length >= batchSize) {
            await deleteDocs(db, toDelete);

            toDelete = [];
        }
    }

    if(toDelete.length > 0) await deleteDocs(db, toDelete);

    return docs.length;
}

async function deleteDocs(db: Firestore, docs: DocumentSnapshot[]) {
    const batch = db.batch();

    docs.forEach((doc) => {
        batch.delete(doc.ref);
    })

    await batch.commit();

    await tick();
}

function tick() {
    return new Promise((resolve) => {
        process.nextTick(() => {
            resolve(0);
        })
    })
}