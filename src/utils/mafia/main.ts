import { EmbedBuilder } from "@discordjs/builders";
import Discord, { ButtonInteraction, ChannelType, ChatInputCommandInteraction, Colors, GuildMember, PermissionsBitField, TextChannel } from "discord.js";
import { CollectionReference, DocumentSnapshot, Firestore, Query } from "firebase-admin/firestore";
import client from "../../discord/client";
import { removeReactions } from "../../discord/helpers";
import { type TextCommand } from '../../discord';
import { getEnabledExtensions } from "../extensions";
import { firebaseAdmin } from "../firebase";
import { type Global } from '../global';
import { clearFiles } from "../google/doc";
import { type Setup } from "../setup";
import { GameSetup, Signups, getGameByID, getGameByName, getGameSetup, refreshSignup } from "./games";
import { onjoin } from "./invite";
import { User, getPlayerObjects, getUsersArray } from "./user";
import { Instance } from "../instance";

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
    }
}

export async function unlockExtensions(instance: Instance, game: Signups, increment: boolean) {
    const extensions = await getEnabledExtensions(instance.global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onUnlock(instance, game, increment)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function unlockGame(instance: Instance, increment: boolean = false, ping: boolean = true) {
    const global = instance.global;
    const setup = instance.setup;
    const game = await getGameByID(global.game ?? "", instance);

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) return await setup.primary.chat.send("Failed to unlock channel, game has not started.");
    if(!global.locked) throw new Error("Already unlocked.");

    await setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {
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

    await setup.primary.chat.permissionOverwrites.create(setup.primary.gang.id, {
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

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: false,
        day: increment ? global.day + 1 : global.day,
    });

    await db.collection('instances').doc(instance.id).collection('games').doc(game.id).collection('days').doc((increment ? global.day + 1 : global.day).toString()).set({
        game: global.game,
    }, { merge: true });

    const message = await setup.primary.chat.send((pings && ping ? "<@&" + setup.primary.alive.id + ">" : "") + " Game has unlocked!");

    if(increment == true) {
        await db.collection('instances').doc(instance.id).collection('games').doc(game.id).collection('days').doc((global.day + 1).toString()).set({
            game: global.game,
            players: global.players.map((player) => player.id),
            start: message.createdTimestamp,
        });
    }

    await unlockExtensions(instance, game, increment);
}

export async function lockExtensions(instance: Instance, game: Signups) {
    const extensions = await getEnabledExtensions(instance.global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onLock(instance, game)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function lockGame(instance: Instance) {
    const global = instance.global;
    const setup = instance.setup;
    const game = await getGameByID(global.game ?? "", instance);

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) throw new Error("Failed to unlock channel, game has not started.");
    if(global.locked) throw new Error("Already locked.");

    await setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {});

    await setup.primary.chat.permissionOverwrites.create(setup.primary.gang.id, {
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

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: true,
    });

    await setup.primary.chat.send("Game has locked!");

    await lockExtensions(instance, game);
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

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc('game');

    const updatedGlobal = {
        started: true,
        locked: true,
        game: game.id,
        players: game.signups.map((signup) => { return { id: signup, alignment: null } }),
        day: 0,
    }

    instance.global = { ...instance.global, ...updatedGlobal };

    await ref.update(updatedGlobal);
}

export async function finishSignups(game: Signups, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(game.id);

    await ref.update({
        closed: true,
    })

    await refreshSignup(game.name, instance);
}

export async function setupPermissions(setup: Setup, lock: boolean) {
    const promises = [] as Promise<any>[];

    if(lock) {
        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {}));

        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
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
        }));
    } else {
        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.alive, {}));

        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
            ViewChannel: true,
            SendMessages: true,
            AddReactions: true,
            AttachFiles: true,
            EmbedLinks: true,
            //SendPolls: true,
            SendVoiceMessages: true,
            UseExternalEmojis: true,
            UseApplicationCommands: true,
            CreatePublicThreads: false,
            CreatePrivateThreads: false, 
            SendMessagesInThreads: false
        }));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function setupDeadPlayer(player: Discord.GuildMember | undefined, setup: Setup) {
    if(player != undefined) {
        await player.roles.remove(setup.secondary.mod);
        await player.roles.remove(setup.secondary.spec);
        await player.roles.remove(setup.secondary.access);
    }
}

export async function setupMainPlayer(player: Discord.GuildMember, setup: Setup) {
    await player.roles.add(setup.primary.alive);
    await player.roles.remove(setup.primary.mod);
}

export async function setupMafiaPlayer(mafiaPlayer: GuildMember | undefined, setup: Setup, gameSetup: GameSetup) {
    if(mafiaPlayer?.joinedTimestamp) {
        await mafiaPlayer.roles.remove(setup.tertiary.mod);
        await mafiaPlayer.roles.remove(setup.tertiary.spec);
        await mafiaPlayer.roles.remove(setup.tertiary.access);

        if(mafiaPlayer.kickable) {
            await mafiaPlayer.kick();
        } else {
            await gameSetup.mafia.send("Failed to kick <@" + mafiaPlayer.id + ">.");
        }
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

export async function setupPlayer(id: string, gameSetup: GameSetup, instance: Instance) {
    const setup = instance.setup;

    const db = firebaseAdmin.getFirestore();

    const { deadPlayer, userProfile, player, mafiaPlayer } = await getPlayerObjects(id, instance);

    if(player) await setupMainPlayer(player, setup);
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
            }
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

export async function startExtensions(instance: Instance, game: Signups) {
    const extensions = await getEnabledExtensions(instance.global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onStart(instance, game)) });

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

    const global = instance.global;

    if(global.started) throw new Error("Game has already started.");

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

    promises.push(deleteCollection(db, db.collection('instances').doc(instance.id).collection("notes"), 20));
    promises.push(deleteCollection(db, db.collection("edits"), 20));
    promises.push(deleteCollection(db, db.collection('instances').doc(instance.id).collection("roles"), 20));
    promises.push(deleteInvites(setup));
    promises.push(finishSignups(game, instance));
    promises.push(setupPermissions(setup, true));
    promises.push(startExtensions(instance, game));
    promises.push(setup.secondary.dms.permissionOverwrites.edit(setup.secondary.spec.id, viewOverwrites()));

    for(let i = 0; i < game.signups.length; i++) {
        promises.push(setupPlayer(game.signups[i], gameSetup, instance));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        const embed = new EmbedBuilder()
            .setTitle("Game Start Failed")
            .setColor(Colors.Red)
            .setDescription(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""))

            if(interaction.type != 'text') {
                return await interaction.editReply({ embeds: [embed] });
            } else {
                await removeReactions(interaction.message);

                return await interaction.reply({ embeds: [embed] });
            }
    }

    const message = await setup.primary.chat.send((pings ? "<@&" + setup.primary.alive.id + "> " : "") + "Game has locked!");

    await markGame(message.createdTimestamp, game.id, instance, 'start');

    if(interaction.type != 'text') {
        await interaction.editReply({ content: "Game is starting!" });
    } else {
        await removeReactions(interaction.message);

        await interaction.message.react("✅")
    }

    //await startLog(setup, global, game);
}

export async function markGame(timestamp: number, gameId: string, instance: Instance, type: 'start' | 'end') {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('games').doc(gameId);

    await ref.update({
        [type]: timestamp,
        state: type == 'end' ? 'completed' : undefined,
    });
}

export async function startLog(setup: Setup, global: Global, game: Signups, instance: Instance) {
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
                value: global.extensions.join("\n"),
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

export async function clearGame(global: Global, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc('game');

    await ref.update({
        started: false,
        locked: false,
        players: [],
        day: 0,
        game: null,
    });

    const gameRef = db.collection('instances').doc(instance.id).collection('games').doc(global.game ?? "---");

    await gameRef.update({
        state: "completed",
        days: global.day,
    } satisfies Partial<Signups>)
}

export async function archiveChannels(setup: Setup) {
    const promises = [] as Promise<any>[];

    await setup.secondary.guild.channels.fetch();

    const channels: TextChannel[] = [];

    for(let i = 0; i < setup.secondary.dms.children.cache.size; i++) {
        if(setup.secondary.dms.children.cache.at(i)) {
            channels.push(setup.secondary.dms.children.cache.at(i) as TextChannel);
        }
    }

    for(let i = 0; i < channels.length; i++) {
        promises.push(channels[i].setParent(setup.secondary.archivedDms, { lockPermissions: true }));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function setMafiaSpectator(mafiaPlayer: GuildMember | undefined, id: string, setup: Setup, gameSetup: GameSetup, userProfile: User, instance: Instance, dm: boolean = true) {
    const db = firebaseAdmin.getFirestore();
    
    if(mafiaPlayer) {
        await mafiaPlayer.roles.add(setup.tertiary.spec);
        await mafiaPlayer.roles.remove(setup.tertiary.access);
    } else if(dm) {
        const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia.id, { unique: true });

        await onjoin({
            id: userProfile.id,
            server: "tertiary",
            roles: {
                add: ["spectator"],
                remove: ["access"],
            }
        }, instance);
            
        const dm = await client.users.cache.get(id)?.createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to " + userProfile.nickname + ".");

        if(pings) {
            await dm.send("Here's a server invite to spectate mafia chat: \nhttps://discord.com/invite/" + invite.code);
        }
    }
}

export async function clearPlayer(id: string, setup: Setup, gameSetup: GameSetup, instance: Instance) {
    const promises = [] as Promise<any>[];

    const { deadPlayer, userProfile, player, mafiaPlayer } = await getPlayerObjects(id, instance);

    if(player) promises.push(player.roles.remove(setup.primary.alive));

    if(deadPlayer) {
        promises.push(deadPlayer.roles.add(setup.secondary.spec));
        promises.push(deadPlayer.roles.remove(setup.secondary.access));
    }

    promises.push(setMafiaSpectator(mafiaPlayer, id, setup, gameSetup, userProfile, instance, true));

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function endExtensions(instance: Instance, game: Signups) {
    const extensions = await getEnabledExtensions(instance.global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onEnd(instance, game)) });

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

    const global = instance.global;

    if(global.started == false) throw new Error("Game has not started." );

    const game = await getGameByID(global.game ?? "bruh", instance);
    const setup = instance.setup;
    
    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred." );
    if(game == null) throw new Error("Game not found.");

    const gameSetup = await getGameSetup(game, setup);

    //await checkSignups(game.signups, setup);

    await clearGame(global, instance);

    const promises = [] as Promise<unknown>[];

    promises.push((async () => {
        const message = await setup.primary.chat.send((pings ? "<@&" + setup.primary.alive.id + "> " : "") + "Game has ended!");

        await markGame(message.createdTimestamp, game.id, instance, 'end');
    })())
    
    promises.push(setupPermissions(setup, false));
    promises.push(archiveChannels(setup));
    promises.push(endExtensions(instance, game));
    promises.push(clearFiles());

    for(let i = 0; i < game.signups.length; i++) {
        promises.push(clearPlayer(game.signups[i], setup, gameSetup, instance));
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

export async function editPlayer(options: { id: string, alignment: 'mafia' | null }, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('settings').doc('game');

    await db.runTransaction(async t => {
        const global = instance.global;

        const player = global.players.find((value) => { value.id == options.id });

        if(player) {
            player.alignment = options.alignment;
        }

        t.update(ref, {
            players: global.players
        })
    })
}


export async function deleteCollection(db: Firestore, collection: CollectionReference, batchSize: number) {
    const count = (await collection.count().get()).data().count;

    for(let i = 0; i < Math.ceil(count / 20); i++) {
        const query = collection.orderBy('__name__').limit(batchSize).offset(i * 20);

        await deleteQueryBatch(db, query, batchSize);
    }
}

async function deleteQueryBatch(db: Firestore, query: Query, batchSize: number) {
    const docs = (await query.get()).docs;

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

    await deleteDocs(db, toDelete);
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