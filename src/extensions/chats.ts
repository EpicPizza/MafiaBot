import { Command } from "commander";
import { ChannelType } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { type TextCommand } from '../discord';
import { simpleJoin } from '../utils/text';
import { fromZod } from '../utils/text';
import { Extension, ExtensionInteraction } from "../utils/extensions";
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { getGameByID } from "../utils/mafia/games";
import { deleteCollection } from "../utils/mafia/main";
import { getUserByName, User } from "../utils/mafia/user";
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";

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
        () => {
            return new Command()
                .name('create')
                .description('create a chat between two to eight players, sperate nicknames with a space. players will be pinged when the chat is created. this command can only be run within dms')
                .argument('<name>', 'name of chat', fromZod(z.string().min(1).max(100)))
                .argument('<players...>', 'nicknames of players', simpleJoin);
        },
        () => {
            return new Command()
                .name('lock')
                .description('lock a chat, preventing players from messaging but keeping access.')
                .option('--match', 'match lock with main chat lock');
        },
        () => {
            return new Command()
                .name('unlock')
                .description('unlock a chat');
        },
        () => {
            return new Command() 
                .name('remove')
                .description('add a player to the chat, pinging them once added')
                .argument('<player>', 'nickname of player')
        },
        () => {
            return new Command() 
                .name('add')
                .description('remove a player\'s access to the chat')
                .argument('<player>', 'nickname of player')
        },
        () => {
            return new Command() 
                .name('close')
                .description('close a chat, removing access for all players. cannot be reversed')
        },
    ],
    interactions: [],
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
    onLock: async (global, setup, game) => {
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
    onUnlock: async (global, setup, game, incremented) => {
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
    onCommand: async (command: TextCommand) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const setup = await getSetup();
        const global = await getGlobal();
        const member = await setup.primary.guild.members.fetch(command.user.id);

        checkMod(setup, global, command.user.id, command.message.guildId ?? "");
        
        if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

        const db = firebaseAdmin.getFirestore();

        if(command.name == "create") {
            const global = await getGlobal();
            const game = await getGameByID(global.game ?? "");

            const chats = [] as User[];

            for(let i = 1; i < command.program.args.length; i++) {
                const user = await getUserByName(command.program.args[i] as string);

                if(user == undefined) throw new Error(command.program.args[i] + " not found.");

                chats.push(user);
            }

            const channel = await setup.secondary.guild.channels.create({ name: "creating" });

            await channel.setParent(setup.secondary.dms.id);

            for(let i = 0; i < chats.length; i++) {
                const member = await setup.secondary.guild.members.fetch(chats[i].id);

                await channel.permissionOverwrites.create(member, messageOverwrites());
            }

            await channel.setName("chat-" + command.program.processedArgs[0] as string);

            await channel.setTopic(game.name + " Mafia");

            await channel.send(chats.reduce((previous, chat) => previous + "<@" + chat.id + "> ", "") + "Here is your chat!");

            await db.collection('chats').doc(channel.id).set({
                chats: chats.map(chat => chat.id),
                locked: false,
                match: false,
            })
        } else if(command.name == "lock" && command.program.getOptionValue('match') === true) {
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

            const user = await getUserByName(command.program.processedArgs[0] as string);

            if(user == undefined) throw new Error(command.program.processedArgs[0] + "not found.");

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
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message, cache) => {},
    onEnd: async (global, setup, game) => {},
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {},
    onVotes: async (global, setup, game, board ) => { return ""; },
    onHammer: async (global, setup, game, hammered) => {},
    onRemove: async (global, setup, game, removed) => {
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
} satisfies Extension;

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