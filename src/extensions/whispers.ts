import { ChannelType, Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getGameByID, getGlobal } from "../utils/main";
import { z } from "zod";
import { firebaseAdmin } from "../firebase";
import { Setup, getSetup } from "../utils/setup";
import { Signups } from "../utils/games";
import { Global } from "../utils/main";
import { User, getUser, getUserByName } from "../utils/user";
import { FieldValue } from "firebase-admin/firestore";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `**This extension can only be run by mods. Other than the create command, all these commands are run within the whisper.**

**?whisper create {name} {nickname} {nickname}...** Create a whisper between two to eight players, sperate nicknames with a space. Players will be pinged when the whisper is created. This command can only be run within dms.

**?whisper close** Close a whisper, removing access for all players. Cannot be reversed.

**?whisper lock** Lock a whisper, preventing players from messaging but keeping access.

**?whisper unlock** Unlock a whisper.

**?whisper lock match** Keep whisper locked while main chat is locked and vice versa. Warning: this is disabled if you manually unlock or lock a whisper after.

**?whisper add {nickname}** Add a player to the whisper, pinging them once added.

**?whisper remove {command}** Remove a player's access to the whisper.

**Additional Notes:** Players are removed from whispers when they are removed from the game.
`

module.exports = {
    name: "Whispers",
    commandName: "whisper",
    description: "Create whispers in dms between players.",
    priority: [ ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "create",
            arguments: {
                required: [ z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100) ],
                optional: [ z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100), z.string().min(1).max(100) ]
            },
        },
        {
            name: "lock",
            arguments: {
                optional: [ z.literal("match") ]
            }
        }, 
        {
            name: "unlock",
            arguments: {},
        },
        {
            name: "remove",
            arguments: {
                required: [ z.string().min(1).max(100) ]
            },
        },
        {
            name: "add",
            arguments: {
                required: [ z.string().min(1).max(100) ]
            },
        }, 
        {
            name: "close",
            arguments: {}
        }
    ] satisfies CommandOptions[],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('whispers'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global: Global, setup: Setup, game: Signups) => {
        const db = firebaseAdmin.getFirestore();

        const docs = (await db.collection('whispers').where('match', '==', true).get()).docs;

        for(let i = 0; i < docs.length; i++) {
            const data = docs[i].data();

            if(!data) continue;

            const channel = await setup.secondary.guild.channels.fetch(docs[i].id).catch(() => undefined)

            if(!channel || channel.type != ChannelType.GuildText) continue;

            for(let j = 0; j < data.whisperers.length; j++) {
                const member = await setup.secondary.guild.members.fetch(data.whisperers[j]);

                await channel.permissionOverwrites.create(member, readOverwrites());
            }
        }
    },
    onUnlock: async (global: Global, setup: Setup, game: Signups, incremented: boolean) => {
        const db = firebaseAdmin.getFirestore();

        const docs = (await db.collection('whispers').where('match', '==', true).get()).docs;

        for(let i = 0; i < docs.length; i++) {
            const data = docs[i].data();

            if(!data) continue;

            const channel = await setup.secondary.guild.channels.fetch(docs[i].id).catch(() => undefined)

            if(!channel || channel.type != ChannelType.GuildText) continue;

            for(let j = 0; j < data.whisperers.length; j++) {
                const member = await setup.secondary.guild.members.fetch(data.whisperers[j]);

                await channel.permissionOverwrites.create(member, messageOverwrites());
            }
        }
    },
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const setup = await getSetup();
        const member = await setup.primary.guild.members.fetch(command.user.id);
        if(!member?.roles.cache.has(setup.primary.mod.id)) throw new Error("You're not a mod!");
        if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

        const db = firebaseAdmin.getFirestore();

        if(command.name == "create") {
            const global = await getGlobal();
            const game = await getGameByID(global.game ?? "");

            const whisperers = [] as User[];

            for(let i = 1; i < command.arguments.length; i++) {
                const user = await getUserByName(capitalize(command.arguments[i] as string));

                if(user == undefined) throw new Error(command.arguments[i] + " not found.");

                whisperers.push(user);
            }

            const channel = await setup.secondary.guild.channels.create({ name: "creating" });

            await channel.setParent(setup.secondary.dms.id);

            for(let i = 0; i < whisperers.length; i++) {
                const member = await setup.secondary.guild.members.fetch(whisperers[i].id);

                await channel.permissionOverwrites.create(member, messageOverwrites());
            }

            await channel.setName("whisper-" + command.arguments[0] as string);

            await channel.setTopic(game.name + " Mafia");

            await channel.send(whisperers.reduce((previous, whisperer) => previous + "<@" + whisperer.id + "> ", "") + "Here is your whisper!");

            await db.collection('whispers').doc(channel.id).set({
                whisperers: whisperers.map(whisperer => whisperer.id),
                locked: false,
                match: false,
            })
        } else if(command.name == "lock" && command.arguments[0] == "match") {
            const data = (await db.collection('whispers').doc(command.message.channel.id).get()).data();
            const global = await getGlobal();

            if(data == undefined) return await command.message.react("❎");

            const whisperers = data.whisperers;
            const channel = command.message.channel;

            for(let i = 0; i < whisperers.length; i++) {
                const member = await setup.secondary.guild.members.fetch(whisperers[i]);

                await channel.permissionOverwrites.create(member, global.locked ? readOverwrites() : messageOverwrites());
            }

            await db.collection('whispers').doc(channel.id).update({
                locked: global.locked,
                match: true,
            });
        } else if(command.name == "lock" || command.name == "unlock") {
            const data = (await db.collection('whispers').doc(command.message.channel.id).get()).data();

            if(data == undefined) return await command.message.react("❎");

            const whisperers = data.whisperers;
            const channel = command.message.channel;

            for(let i = 0; i < whisperers.length; i++) {
                const member = await setup.secondary.guild.members.fetch(whisperers[i]);

                await channel.permissionOverwrites.create(member, command.name == "lock" ? readOverwrites() : messageOverwrites());
            }

            await db.collection('whispers').doc(channel.id).update({
                locked: command.name == "lock",
                match: false,
            });
        } else if(command.name == "add" || command.name == "remove") {
            const data = (await db.collection('whispers').doc(command.message.channel.id).get()).data();

            if(data == undefined) return await command.message.react("❎");

            const whisperers = data.whisperers;
            const locked = data.locked;
            const channel = command.message.channel;

            const user = await getUserByName(capitalize(command.arguments[0] as string));

            if(user == undefined) throw new Error(command.arguments[0] + "not found.");

            if(command.name == "add" && whisperers.includes(user.id)) throw new Error("Already added.");
            if(command.name == "remove" && !whisperers.includes(user.id)) throw new Error("Already not in whisper.");

            const member = await setup.secondary.guild.members.fetch(user.id);

            if(command.name == "add") {
                await channel.permissionOverwrites.create(member, locked ? readOverwrites() : messageOverwrites());

                await db.collection('whispers').doc(channel.id).update({
                    whisperers: FieldValue.arrayUnion(user.id),
                });

                await channel.send("<@" + user.id + "> You have been added to this whisper.")
            } else {
                await channel.permissionOverwrites.delete(member);

                await db.collection('whispers').doc(channel.id).update({
                    whisperers: FieldValue.arrayRemove(user.id),
                });
            }
        } else if(command.name == "close") {
            const data = (await db.collection('whispers').doc(command.message.channel.id).get()).data();

            if(data == undefined) return await command.message.react("❎");

            const whisperers = data.whisperers;
            const channel = command.message.channel;

            for(let i = 0; i < whisperers.length; i++) {
                const member = await setup.secondary.guild.members.fetch(whisperers[i]);

                await channel.permissionOverwrites.delete(member);
            }

            await channel.setName("closed " + channel.name);

            await db.collection('whispers').doc(channel.id).delete();
        }

        await command.message.react("✅");

        /**
         * Nothing to return.
         */
    },
    onMessage: async (message: Message, cache: Cache) => {},
    onEnd: async (global, setup, game) => {},
    onVote: async (votes: Vote[], vote: Vote ,voted: boolean, global, setup, game) => {},
    onVotes: async (voting: string[], votes: Map<string, Vote[]>, day: number, global, setup, game) => {},
    onHammer: async (global, setup, game, hammered: string) => {},
    onRemove: async (global: Global, setup: Setup, game: Signups, removed: string) => {
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('whispers').where('whisperers', 'array-contains', removed);

        const docs = (await ref.get()).docs;

        for(let i = 0; i < docs.length; i++) {
            const data = docs[i].data();

            if(!data) continue;

            const channel = await setup.secondary.guild.channels.fetch(docs[i].id).catch(() => undefined);

            if(!channel || channel.type != ChannelType.GuildText) continue;

            const member = await setup.secondary.guild.members.fetch(removed);

            await channel.permissionOverwrites.delete(member);

            await db.collection('whispers').doc(docs[i].id).update({
                whisperers: FieldValue.arrayRemove(removed),
            })
        }
    }
}

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
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
    }
}