import { Command } from "commander";
import { ChannelType, Role } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { type TextCommand } from '../discord';
import client from "../discord/client";
import { removeReactions } from "../discord/helpers";
import { Extension, ExtensionInteraction } from "../utils/extensions";
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { closeSignups, GameSetup, getGameByID, getGameByName, getGameSetup } from "../utils/mafia/games";
import { onjoin } from "../utils/mafia/invite";
import { archiveChannels, deleteInvites, setupDeadPlayer } from "../utils/mafia/main";
import { getPlayerObjects, getUserByName } from "../utils/mafia/user";
import { checkMod } from "../utils/mod";
import { getSetup, Setup } from "../utils/setup";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

//                   Ongoing Chat          Archived Chats        DM Storage             Old Player DMs         Old Mafia
const categoryIds = ["1281884365994856524", "1281884411448660009", "1281884474312884266"]; //prod
//const categoryIds = ["1247776492029481081"];
export const playersRoleId = "1413736283083247677"; //prod
//export const playersRoleId = "1390188023529996400";

const help = `Upick Extension assumes that all players have signed up. While players may be added afterwards, there are no checks in place to see if they had already saw other channels.

**?upick start {game}** Setup all player dms. Will create a temporary players role, which gives them access to all channels except other dm channels.

**?upick revert** Close all player dms and give back spectator roles as normal.

**?upick add {nickname}** Add a player after pregame has started. Will also add them to signups without having to reopen signups.
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
                .description('setup all player dms')
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
                .name('respect')
                .description('alejandro uses this to debug/fix')
        },
    ],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('upick').doc('settings');
        const gameId = (await ref.get()).data()?.game as undefined | string;
        if(gameId == undefined) return;
        const check = await getGameByID(gameId);
        if(check == undefined) throw new Error("Game not found.");
        const gameSetup = await getGameSetup(check, setup);

        await ref.delete();

        const categories = (await Promise.all(categoryIds.map(id => setup.secondary.guild.channels.fetch(id)))).filter(category => category != null).filter(category => category.type == ChannelType.GuildCategory);
        if(categories.length != categoryIds.length) throw new Error("Failed to fetch all categories.");

        const playersRole = await setup.secondary.guild.roles.fetch(playersRoleId);
        if(playersRole == null) throw new Error("Players role not found!");

        await Promise.all(categories.map(category => {
            if(category.permissionOverwrites.cache.get(playersRole.id)) {
                return category.permissionOverwrites.delete(playersRole.id);
            }
        }));

        const dms = setup.secondary.dms;

        if(dms.permissionOverwrites.cache.get(playersRole.id)) {
            await dms.permissionOverwrites.delete(playersRole.id);
        }

        const players = await Promise.all(check.signups.map(signup => getPlayerObjects(signup, setup)));

        await Promise.all(players.map(player => player.deadPlayer?.roles.remove(playersRole.id)));

        //Throwing error doesn't stop game start, since extenion onStart runs concurrently to the rest of the game start processes. So the best thing we can do is send an error message and then I can tell the game mod what they need to fix.
        if(check.id != game.id) throw new Error("Started wrong game??? Things are messed up now???");

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {},
    onUnlock: async (global, setup, game, incremented) => {},
    onCommand: async (command: TextCommand) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        await command.message.react("<a:loading:1256150236112621578>");

        const db = firebaseAdmin.getFirestore();

        const setup = await getSetup();
        const global = await getGlobal();

        await checkMod(setup, global, command.user.id, command.message.guildId ?? "---");
        
        if(command.name == "respec") {
            const categories = (await Promise.all(categoryIds.map(id => setup.secondary.guild.channels.fetch(id)))).filter(category => category != null).filter(category => category.type == ChannelType.GuildCategory);
            if(categories.length != categoryIds.length) throw new Error("Failed to fetch all categories.");

            const playersRole = await setup.secondary.guild.roles.fetch(playersRoleId);
            if(playersRole == null) throw new Error("Players role not found!");

            await Promise.all(categories.map(category => {
                if(category.permissionOverwrites.cache.get(playersRole.id)) {
                    return category.permissionOverwrites.edit(playersRole.id, messageOverwrites());
                } else {
                    return category.permissionOverwrites.create(playersRole.id, messageOverwrites());
                }
            }));
        } else if(command.name == "setup") {
            const categories = (await Promise.all(categoryIds.map(id => setup.secondary.guild.channels.fetch(id)))).filter(category => category != null).filter(category => category.type == ChannelType.GuildCategory);
            if(categories.length != categoryIds.length) throw new Error("Failed to fetch all categories.");

            const playersRole = await setup.secondary.guild.roles.fetch(playersRoleId);
            if(playersRole == null) throw new Error("Players role not found!");
        } else if(command.name == "start") {
            const game = await getGameByName(command.program.processedArgs[0] as string);
            if(game == undefined) throw new Error("Game not found.");
            const gameSetup = await getGameSetup(game, setup);

            if(global.started) throw new Error("Game has already started.");

            await deleteInvites(setup);
            await closeSignups(game.name);

            const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('upick').doc('settings');
            if(((await ref.get()).data()?.game) as undefined | string != undefined) throw new Error("Already started pregame!");
            await ref.set({ game: game.id });

            const categories = (await Promise.all(categoryIds.map(id => setup.secondary.guild.channels.fetch(id)))).filter(category => category != null).filter(category => category.type == ChannelType.GuildCategory);
            if(categories.length != categoryIds.length) throw new Error("Failed to fetch all categories.");

            const playersRole = await setup.secondary.guild.roles.fetch(playersRoleId);
            if(playersRole == null) throw new Error("Players role not found!");

            await Promise.all(categories.map(category => {
                if(category.permissionOverwrites.cache.get(playersRole.id)) {
                    return category.permissionOverwrites.edit(playersRole.id, messageOverwrites());
                } else {
                    return category.permissionOverwrites.create(playersRole.id, messageOverwrites());
                }
            }));

            const dms = setup.secondary.dms;

            if(dms.permissionOverwrites.cache.get(playersRole.id)) {
                await dms.permissionOverwrites.edit(playersRole.id, blockOverwrites());
            } else {
                await dms.permissionOverwrites.create(playersRole.id, blockOverwrites());
            }

            const players = await Promise.all(game.signups.map(signup => getPlayerObjects(signup, setup)));
            
            await Promise.all(players.map(player => pregameSetupPlayer(player, setup, playersRole, gameSetup) ));
        } else if(command.name == "revert") {
            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('upick').doc('settings');
            const gameId = (await ref.get()).data()?.game as undefined | string;
            if(gameId == undefined) throw new Error("Pregame has not started!");
            const check = await getGameByID(gameId);
            if(check == undefined) throw new Error("Game not found.");

            await ref.delete();

            const categories = (await Promise.all(categoryIds.map(id => setup.secondary.guild.channels.fetch(id)))).filter(category => category != null).filter(category => category.type == ChannelType.GuildCategory);
            if(categories.length != categoryIds.length) throw new Error("Failed to fetch all categories.");

            const playersRole = await setup.secondary.guild.roles.fetch(playersRoleId);
            if(playersRole == null) throw new Error("Players role not found!");

            await Promise.all(categories.map(category => {
                if(category.permissionOverwrites.cache.get(playersRole.id)) {
                    return category.permissionOverwrites.delete(playersRole.id);
                }
            }));

            const dms = setup.secondary.dms;

            if(dms.permissionOverwrites.cache.get(playersRole.id)) {
                await dms.permissionOverwrites.delete(playersRole.id);
            }

            const players = await Promise.all(check.signups.map(signup => getPlayerObjects(signup, setup)));

            await Promise.all(players.map(player => player.deadPlayer?.roles.remove(playersRole)));
            await Promise.all(players.map(player => player.deadPlayer?.roles.add(setup.secondary.spec)));

            await archiveChannels(setup);
        } else if(command.name == "add") {
            const user = await getUserByName(command.program.processedArgs[0] as string);
            if(user == undefined) throw new Error("Player not found!");

            const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('upick').doc('settings');
            const gameId = (await ref.get()).data()?.game as undefined | string;
            if(gameId == undefined) throw new Error("Pregame has not started!");
            const check = await getGameByID(gameId);
            if(check == undefined) throw new Error("Game not found.");
            const gameSetup = await getGameSetup(check, setup);

            await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('game').collection('games').doc(check.id).update({
                signups: FieldValue.arrayUnion(user.id),
            })

            const playersRole = await setup.secondary.guild.roles.fetch(playersRoleId);
            if(playersRole == null) throw new Error("Players role not found!");

            const player = await getPlayerObjects(user.id, setup);

            await pregameSetupPlayer(player, setup, playersRole, gameSetup);
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
    onEnd: async (global, setup, game) => {},
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {},
    onVotes: async (global, setup, game, board ) => { return ""; },
    onHammer: async (global, setup, game, hammered) => {},
    onRemove: async (global, setup, game, removed) => {}
} satisfies Extension;

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

async function pregameSetupPlayer(player: Awaited<ReturnType<typeof getPlayerObjects>>, setup: Setup, playersRole: Role, gameSetup: GameSetup) {
    const db = firebaseAdmin.getFirestore();

    await setupDeadPlayer(player.deadPlayer, setup);

    let channel = await setup.secondary.guild.channels.fetch(player.userProfile.channel ?? "").catch(() => null);
    let newPlayer = channel == null;

    if(channel == null || channel.type != ChannelType.GuildText) {
        channel = await setup.secondary.guild.channels.create({ 
            parent: setup.secondary.dms, 
            name: player.userProfile.nickname.toLowerCase()
        });

        await db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('users').doc(player.userProfile.id).update({
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
                content: "Welcome <@" + player.userProfile.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod."
            }
        });

        const dm = await client.users.cache.get(player.userProfile.id)?.createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to " + player.userProfile.nickname + ".");

        dm.send("Join the Dead Chat server to play in mafia! Here's a server invite: \nhttps://discord.com/invite/" + invite.code);
    } else if(newPlayer) {
        await player.deadPlayer.roles.add(playersRole);

        await channel.permissionOverwrites.create(player.userProfile.id, messageOverwrites());

        channel.send("Welcome <@" + player.userProfile.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod.");
    } else {
        await player.deadPlayer.roles.add(playersRole);

        await channel.permissionOverwrites.create(player.userProfile.id, messageOverwrites());
    }
}