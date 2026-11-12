import { Command } from "commander";
import { ChannelType, Role } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { Event, type TextCommand } from '../discord';
import client from "../discord/client";
import { removeReactions } from "../discord/helpers";
import { Extension, ExtensionInteraction } from "../utils/extensions";
import { firebaseAdmin } from "../utils/firebase";
import { GameSetup, getGameByID, Signups, getGameByName, getGameSetup } from "../utils/mafia/games";
import { onjoin } from "../utils/mafia/invite";
import { archiveChannels, deleteInvites, setupDeadPlayer } from "../utils/mafia/main";
import { getPlayerObjects, getUserByName } from "../utils/mafia/user";
import { checkMod } from "../utils/mod";
import { Instance } from "../utils/instance";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

//                   Ongoing Chat          Archived Chats        DM Storage             Old Player DMs         Old Mafia
const categoryIds = ["723651039693373454", "723636076811386923", "1244509911098851452", "1363452733885255812", "1266670814082633828"];
//const categoryIds = ["1247776492029481081"];
export const playersRoleId = "1390130766842695681"; //prod
//export const playersRoleId = "1390188023529996400";

const help = `Upick Extension opens dm channels during signups. Signups stay open after pregame starts, and each new signup automatically gets their own dm channel. There are no checks in place to see if late signups had already seen other channels.

**?upick start {game}** Start pregame. Sets up dms for everyone currently signed up and keeps signups open, creating a dm for each new signup. Will create a temporary players role, which gives them access to all channels except other dm channels.

**?upick revert** Close all player dms and give back spectator roles as normal.

**?upick add {nickname}** Manually add a player after pregame has started. Will also add them to signups, even if signups are closed.
`

module.exports = {
    name: "Upick",
    emoji: "🖋️",
    commandName: "upick",
    description: "Used to open dm channels early in upick games.",
    priority: [], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        () => {
            return new Command()
                .name('start')
                .description('start pregame, setting up dms for current and future signups')
                .argument('<game>', 'name of game');
        },
        () => {
            return new Command()
                .name('revert')
                .description('close all player dms and give back spectator roles as normal');
        },
        () => {
            return new Command()
                .name('add')
                .description('add a plyer after pregame has started')
                .argument('<player>', 'nickname');
        },
        () => {
            return new Command()
                .name('setup')
                .description('alejandro uses this to debug/fix')
        },
        () => {
            return new Command()
                .name('respec')
                .description('alejandro uses this to debug/fix')
        },
    ],
    interactions: [],
    onStart: async (instance, game) => {
        /**
         * Runs during game start processes.
         */

        const setup = instance.setup;

        const ref = settingsRef(instance);
        const settings = (await ref.get()).data();
        const gameId = settings?.game as undefined | string;
        if(gameId == undefined) return;
        const check = await getGameByID(gameId, instance);
        if(check == undefined) throw new Error("Game not found.");

        await ref.delete();

        const { playersRole } = await clearPregamePermissions(instance);

        const players = await Promise.all(check.signups.map(signup => getPlayerObjects(signup, instance)));

        await Promise.all(players.map(player => player.deadPlayer?.roles.remove(playersRole.id)));

        // Players who left during pregame: archive their dm channel and turn them back into spectators.
        const left = ((settings?.left ?? []) as string[]).filter(id => !check.signups.includes(id));

        await Promise.all(left.map(id => cleanupLeftPlayer(id, instance, playersRole)));

        //Throwing error doesn't stop game start, since extenion onStart runs concurrently to the rest of the game start processes. So the best thing we can do is send an error message and then I can tell the game mod what they need to fix.
        if(check.id != game.id) throw new Error("Started wrong game??? Things are messed up now???");

        return;

        /**
         * Nothing to return.
         */
    },
    onSignup: async (instance, game, id) => {
        /**
         * Runs whenever a player is newly added to a game's signups.
         * If pregame is running for this game, set up their dm channel right away.
         */

        if(instance.global.started) return;

        const gameId = (await settingsRef(instance).get()).data()?.game as undefined | string;
        if(gameId == undefined || gameId != game.id) return;

        await settingsRef(instance).update({ left: FieldValue.arrayRemove(id) });

        const gameSetup = await getGameSetup(game, instance.setup);

        const playersRole = await fetchPlayersRole(instance);

        const player = await getPlayerObjects(id, instance);

        await pregameSetupPlayer(player, instance, playersRole, game, gameSetup);
    },
    onLeave: async (instance, game, id) => {
        /**
         * Runs whenever a player is removed from a game's signups.
         * If pregame is running for this game, let them know their dm channel stays open.
         */

        if(instance.global.started) return;

        const gameId = (await settingsRef(instance).get()).data()?.game as undefined | string;
        if(gameId == undefined || gameId != game.id) return;

        await settingsRef(instance).update({ left: FieldValue.arrayUnion(id) });

        const player = await getPlayerObjects(id, instance);

        const channel = await instance.setup.secondary.guild.channels.fetch(player.userProfile.channel ?? "").catch(() => null);
        if(channel == null || channel.type != ChannelType.GuildText) return;

        await channel.send("<@" + id + "> You've left the game, but this channel will remain open in case you re-join the game.");
    },
    onLock: async (instance, game) => {},
    onUnlock: async (instance, game, incremented) => {},
    onCommand: async (command: Event<TextCommand>) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        command.inInstance();

        await command.message.react("<a:loading:1256150236112621578>");

        const db = firebaseAdmin.getFirestore();

        const instance = command.instance;
        const setup = instance.setup;
        const global = instance.global;

        await checkMod(setup, global, command.user.id, command.message.guildId ?? "---");
        
        if(command.name == "respec") {
            await fetchCategories(instance);
            const playersRole = await fetchPlayersRole(instance);

            await applyPregamePermissions(instance, playersRole);
        } else if(command.name == "setup") {
            await fetchCategories(instance);
            await fetchPlayersRole(instance);
        } else if(command.name == "start") {
            const game = await getGameByName(command.program.processedArgs[0] as string, instance);
            if(game == undefined) throw new Error("Game not found.");
            const gameSetup = await getGameSetup(game, setup);

            if(global.started) throw new Error("Game has already started.");

            const ref = settingsRef(instance);
            if(((await ref.get()).data()?.game) as undefined | string != undefined) throw new Error("Already started pregame!");

            await deleteInvites(setup);

            const playersRole = await fetchPlayersRole(instance);

            await applyPregamePermissions(instance, playersRole);

            // Mark pregame as started before setting up current signups, so anyone signing up mid-setup is handled by onSignup.
            await ref.set({ game: game.id, left: [] });

            const current = await getGameByID(game.id, instance);

            const players = await Promise.all(current.signups.map(signup => getPlayerObjects(signup, instance)));
            
            await Promise.all(players.map(player => pregameSetupPlayer(player, instance, playersRole, current, gameSetup) ));
        } else if(command.name == "revert") {
            const ref = settingsRef(instance);
            const gameId = (await ref.get()).data()?.game as undefined | string;
            if(gameId == undefined) throw new Error("Pregame has not started!");
            const check = await getGameByID(gameId, instance);
            if(check == undefined) throw new Error("Game not found.");

            await ref.delete();

            const { playersRole } = await clearPregamePermissions(instance);

            const players = await Promise.all(check.signups.map(signup => getPlayerObjects(signup, instance)));

            await Promise.all(players.map(player => player.deadPlayer?.roles.remove(playersRole)));
            await Promise.all(players.map(player => player.deadPlayer?.roles.add(setup.secondary.spec)));

            await archiveChannels(setup);
        } else if(command.name == "add") {
            const user = await getUserByName(command.program.processedArgs[0] as string, instance);
            if(user == undefined) throw new Error("Player not found!");

            const ref = settingsRef(instance);
            const gameId = (await ref.get()).data()?.game as undefined | string;
            if(gameId == undefined) throw new Error("Pregame has not started!");
            const check = await getGameByID(gameId, instance);
            if(check == undefined) throw new Error("Game not found.");
            const gameSetup = await getGameSetup(check, setup);

            await db.collection('instances').doc(instance.id).collection('games').doc(check.id).update({
                signups: FieldValue.arrayUnion(user.id),
            })

            const playersRole = await fetchPlayersRole(instance);

            const player = await getPlayerObjects(user.id, instance);

            await pregameSetupPlayer(player, instance, playersRole, check, gameSetup);
        }

        await removeReactions(command.message);
        await command.message.react("✅");

        return;

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message) => {},
    onEnd: async (instance, game) => {},
    onVote: async (instance, game, voter, voting, type, users, transaction) => {},
    onVotes: async (instance, game, board ) => { return ""; },
    onHammer: async (instance, game, hammered) => {},
    onRemove: async (instance, game, removed) => {},
    onDump: async (statsBatch, messageBatch, reactionBatch) => {},
} satisfies Extension;

async function cleanupLeftPlayer(id: string, instance: Instance, playersRole: Role) {
    const setup = instance.setup;

    const player = await getPlayerObjects(id, instance);

    if(player.deadPlayer) {
        await player.deadPlayer.roles.remove(playersRole);
        await player.deadPlayer.roles.add(setup.secondary.spec);
    }

    const channel = await setup.secondary.guild.channels.fetch(player.userProfile.channel ?? "").catch(() => null);

    if(channel != null && channel.type == ChannelType.GuildText && channel.parentId == setup.secondary.dms.id) {
        await channel.setParent(setup.secondary.archivedDms, { lockPermissions: true });
    }
}

function settingsRef(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    return db.collection('instances').doc(instance.id).collection('upick').doc('settings');
}

async function fetchCategories(instance: Instance) {
    const setup = instance.setup;

    const categories = (await Promise.all(categoryIds.map(id => setup.secondary.guild.channels.fetch(id)))).filter(category => category != null).filter(category => category.type == ChannelType.GuildCategory);
    if(categories.length != categoryIds.length) throw new Error("Failed to fetch all categories.");

    return categories;
}

async function fetchPlayersRole(instance: Instance) {
    const playersRole = await instance.setup.secondary.guild.roles.fetch(playersRoleId);
    if(playersRole == null) throw new Error("Players role not found!");

    return playersRole;
}

async function applyPregamePermissions(instance: Instance, playersRole: Role) {
    const categories = await fetchCategories(instance);

    await Promise.all(categories.map(category => {
        if(category.permissionOverwrites.cache.get(playersRole.id)) {
            return category.permissionOverwrites.edit(playersRole.id, messageOverwrites());
        } else {
            return category.permissionOverwrites.create(playersRole.id, messageOverwrites());
        }
    }));

    const dms = instance.setup.secondary.dms;

    if(dms.permissionOverwrites.cache.get(playersRole.id)) {
        await dms.permissionOverwrites.edit(playersRole.id, blockOverwrites());
    } else {
        await dms.permissionOverwrites.create(playersRole.id, blockOverwrites());
    }
}

async function clearPregamePermissions(instance: Instance) {
    const categories = await fetchCategories(instance);
    const playersRole = await fetchPlayersRole(instance);

    await Promise.all(categories.map(category => {
        if(category.permissionOverwrites.cache.get(playersRole.id)) {
            return category.permissionOverwrites.delete(playersRole.id);
        }
    }));

    const dms = instance.setup.secondary.dms;

    if(dms.permissionOverwrites.cache.get(playersRole.id)) {
        await dms.permissionOverwrites.delete(playersRole.id);
    }

    return { playersRole };
}

export function blockOverwrites() {
    return {
        ViewChannel: false,
        SendMessages: false,
        AddReactions: false, 
        AttachFiles: false, 
        EmbedLinks: false, 
        SendPolls: false, 
        SendVoiceMessages: false,
        UseExternalEmojis: false,
        SendTTSMessages: false,
        UseApplicationCommands: false,
        ReadMessageHistory: false,
    }
}

export function messageOverwrites() {
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
        ReadMessageHistory: true
    }
}

export function readOverwrites() {
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
        ReadMessageHistory: true
    }
}

async function pregameSetupPlayer(player: Awaited<ReturnType<typeof getPlayerObjects>>, instance: Instance, playersRole: Role, game: Signups, gameSetup: GameSetup) {
    const db = firebaseAdmin.getFirestore();
    const setup = instance.setup;

    const signupMessage = "<@" + player.userProfile.id + "> You've signed up for " + game.name + ", please submit your role here!";

    await setupDeadPlayer(player.deadPlayer, setup);

    let channel = await setup.secondary.guild.channels.fetch(player.userProfile.channel ?? "").catch(() => null);
    let newPlayer = channel == null;

    if(channel == null || channel.type != ChannelType.GuildText) {
        channel = await setup.secondary.guild.channels.create({ 
            parent: setup.secondary.dms, 
            name: player.userProfile.nickname.toLowerCase()
        });

        await db.collection('instances').doc(instance.id).collection('users').doc(player.userProfile.id).update({
            channel: channel.id,
        });
    }

    if(channel.parentId != setup.secondary.dms.id) {
        await channel.setParent(setup.secondary.dms.id);
    }

    if(!player.deadPlayer) {
        const invite = await setup.secondary.guild.invites.create(channel, { unique: true });

        await onjoin({
            id: player.userProfile.id,
            server: "secondary",
            roles: {
                add: ["players"]
            },
            permissions: {
                channel: channel.id,
            },
            message: {
                channel: channel.id,
                content: signupMessage
            }
        }, instance);

        const dm = await client.users.cache.get(player.userProfile.id)?.createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to " + player.userProfile.nickname + ".");

        dm.send("Join the Dead Chat server to play in mafia! Here's a server invite: \nhttps://discord.com/invite/" + invite.code);
    } else if(newPlayer) {
        await player.deadPlayer.roles.add(playersRole);

        await channel.permissionOverwrites.create(player.userProfile.id, messageOverwrites());

        await channel.send(signupMessage);
    } else {
        await player.deadPlayer.roles.add(playersRole);

        await channel.permissionOverwrites.create(player.userProfile.id, messageOverwrites());

        await channel.send(signupMessage);
    }
}