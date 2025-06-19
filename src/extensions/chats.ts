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
import { checkMod } from "../utils/mod";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `**This extension can only be run by mods. Other than the create command, all these commands are run within the chat.**

**?chat create {name} {nickname} {nickname}...** Create a chat between two to eight players, sperate nicknames with a space. Players will be pinged when the chat is created. This command can only be run within dms.

**?chat close** Close a chat, removing access for all players. Cannot be reversed.

**?chat lock** Lock a chat, preventing players from messaging but keeping access.

**?chat unlock** Unlock a chat.

**?chat lock match** Keep chat locked while main chat is locked and vice versa. Warning: this is disabled if you manually unlock or lock a chat after.

**?chat add {nickname}** Add a player to the chat, pinging them once added.

**?chat remove {command}** Remove a player's access to the chat.

**Additional Notes:** Players are removed from chats when they are removed from the game.
`

module.exports = {
    name: "Chats",
    emoji: "💬",
    commandName: "chat",
    description: "Creates chats in dms between players.",
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

        await deleteCollection(db, db.collection('chats'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global: Global, setup: Setup, game: Signups) => {
        const db = firebaseAdmin.getFirestore();

        const docs = (await db.collection('chats').where('match', '==', true).get()).docs;

        for(let i = 0; i < docs.length; i++) {
            const data = docs[i].data();

            if(!data) continue;

            const channel = await setup.secondary.guild.channels.fetch(docs[i].id).catch(() => undefined)

            if(!channel || channel.type != ChannelType.GuildText) continue;

            for(let j = 0; j < data.chats.length; j++) {
                const member = await setup.secondary.guild.members.fetch(data.chats[j]);

                await channel.permissionOverwrites.create(member, readOverwrites());
            }
        }
    },
    onUnlock: async (global: Global, setup: Setup, game: Signups, incremented: boolean) => {
        const db = firebaseAdmin.getFirestore();

        const docs = (await db.collection('chats').where('match', '==', true).get()).docs;

        for(let i = 0; i < docs.length; i++) {
            const data = docs[i].data();

            if(!data) continue;

            const channel = await setup.secondary.guild.channels.fetch(docs[i].id).catch(() => undefined)

            if(!channel || channel.type != ChannelType.GuildText) continue;

            for(let j = 0; j < data.chats.length; j++) {
                const member = await setup.secondary.guild.members.fetch(data.chats[j]);

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

        checkMod(setup, command.user.id, command.message.guildId ?? "");
        
        if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

        const db = firebaseAdmin.getFirestore();

        if(command.name == "create") {
            const global = await getGlobal();
            const game = await getGameByID(global.game ?? "");

            const chats = [] as User[];

            for(let i = 1; i < command.arguments.length; i++) {
                const user = await getUserByName(command.arguments[i] as string);

                if(user == undefined) throw new Error(command.arguments[i] + " not found.");

                chats.push(user);
            }

            const channel = await setup.secondary.guild.channels.create({ name: "creating" });

            await channel.setParent(setup.secondary.dms.id);

            for(let i = 0; i < chats.length; i++) {
                const member = await setup.secondary.guild.members.fetch(chats[i].id);

                await channel.permissionOverwrites.create(member, messageOverwrites());
            }

            await channel.setName("chat-" + command.arguments[0] as string);

            await channel.setTopic(game.name + " Mafia");

            await channel.send(chats.reduce((previous, chat) => previous + "<@" + chat.id + "> ", "") + "Here is your chat!");

            await db.collection('chats').doc(channel.id).set({
                chats: chats.map(chat => chat.id),
                locked: false,
                match: false,
            })
        } else if(command.name == "lock" && command.arguments[0] == "match") {
            const data = (await db.collection('chats').doc(command.message.channel.id).get()).data();
            const global = await getGlobal();

            if(data == undefined) return await command.message.react("❎");

            const chats = data.chats;
            const channel = command.message.channel;

            for(let i = 0; i < chats.length; i++) {
                const member = await setup.secondary.guild.members.fetch(chats[i]);

                await channel.permissionOverwrites.create(member, global.locked ? readOverwrites() : messageOverwrites());
            }

            await db.collection('chats').doc(channel.id).update({
                locked: global.locked,
                match: true,
            });
        } else if(command.name == "lock" || command.name == "unlock") {
            const data = (await db.collection('chats').doc(command.message.channel.id).get()).data();

            if(data == undefined) return await command.message.react("❎");

            const chats = data.chats;
            const channel = command.message.channel;

            for(let i = 0; i < chats.length; i++) {
                const member = await setup.secondary.guild.members.fetch(chats[i]);

                await channel.permissionOverwrites.create(member, command.name == "lock" ? readOverwrites() : messageOverwrites());
            }

            await db.collection('chats').doc(channel.id).update({
                locked: command.name == "lock",
                match: false,
            });
        } else if(command.name == "add" || command.name == "remove") {
            const data = (await db.collection('chats').doc(command.message.channel.id).get()).data();

            if(data == undefined) return await command.message.react("❎");

            const chats = data.chats;
            const locked = data.locked;
            const channel = command.message.channel;

            const user = await getUserByName(command.arguments[0] as string);

            if(user == undefined) throw new Error(command.arguments[0] + "not found.");

            if(command.name == "add" && chats.includes(user.id)) throw new Error("Already added.");
            if(command.name == "remove" && !chats.includes(user.id)) throw new Error("Already not in chat.");

            const member = await setup.secondary.guild.members.fetch(user.id);

            if(command.name == "add") {
                await channel.permissionOverwrites.create(member, locked ? readOverwrites() : messageOverwrites());

                await db.collection('chats').doc(channel.id).update({
                    chats: FieldValue.arrayUnion(user.id),
                });

                await channel.send("<@" + user.id + "> You have been added to this chat.")
            } else {
                await channel.permissionOverwrites.delete(member);

                await db.collection('chats').doc(channel.id).update({
                    chats: FieldValue.arrayRemove(user.id),
                });
            }
        } else if(command.name == "close") {
            const data = (await db.collection('chats').doc(command.message.channel.id).get()).data();

            if(data == undefined) return await command.message.react("❎");

            const chats = data.chats;
            const channel = command.message.channel;

            for(let i = 0; i < chats.length; i++) {
                const member = await setup.secondary.guild.members.fetch(chats[i]);

                await channel.permissionOverwrites.delete(member);
            }

            await channel.setName("closed " + channel.name);

            await db.collection('chats').doc(channel.id).delete();
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

        const ref = db.collection('chats').where('chats', 'array-contains', removed);

        const docs = (await ref.get()).docs;

        for(let i = 0; i < docs.length; i++) {
            const data = docs[i].data();

            if(!data) continue;

            const channel = await setup.secondary.guild.channels.fetch(docs[i].id).catch(() => undefined);

            if(!channel || channel.type != ChannelType.GuildText) continue;

            const member = await setup.secondary.guild.members.fetch(removed);

            await channel.permissionOverwrites.delete(member);

            await db.collection('chats').doc(docs[i].id).update({
                chats: FieldValue.arrayRemove(removed),
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