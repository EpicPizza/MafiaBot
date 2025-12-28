import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Channel, ChannelType, Colors, EmbedBuilder, GuildChannel, GuildChannelOverwriteOptions, PermissionOverwriteOptions } from "discord.js";
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

const help = `no meow`

module.exports = {
    name: "Threads",
    emoji: "💬",
    commandName: "thread",
    description: "Creates threads in dms between players.",
    priority: [ ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        () => {
            return new Command()
                .name('create')
                .description('create a thread between two to eight players, sperate nicknames with a space. players will be pinged when the thread is created. this command can only be run within dms')
                .argument('<name>', 'name of chat', fromZod(z.string().min(1).max(100)))
                .argument('<players...>', 'nicknames of players', simpleJoin);
        },
        () => {
            return new Command()
                .name('lock')
                .description('lock all threads, preventing players from messaging but keeping access.')
        },
        () => {
            return new Command()
                .name('unlock')
                .description('unlock all threads');
        },
        () => {
            return new Command() 
                .name('remove')
                .description('add a player to the thread, pinging them once added')
                .argument('<player>', 'nickname of player')
        },
        () => {
            return new Command() 
                .name('add')
                .description('remove a player\'s access to the thread')
                .argument('<player>', 'nickname of player')
        },
        () => {
            return new Command() 
                .name('close')
                .description('close a thread, removing access for all players. cannot be reversed')
        },
    ],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();
        const col = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('threads');

        await deleteCollection(db, col, 20);
        
        const channel = await setup.secondary.guild.channels.create({ name: "creating" });
        await channel.setParent(setup.secondary.dms.id);
        await channel.permissionOverwrites.create(channel.guild.roles.everyone, readOverwrites());
        await channel.setName("threads");
        await channel.setTopic(game.name + " Mafia");

        await col.doc('main').set({
            channel: channel.id,
        });

        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('Threads Channel')
            .setDescription('This channel will be used to facilitate private threads between players.');

        await channel.send({ embeds: [embed] });

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

        const setup = await getSetup();
        const global = await getGlobal();

        checkMod(setup, global, command.user.id, command.message.guildId ?? "");
        
        if(!(command.message.channel.type == ChannelType.GuildText || command.message.channel.type == ChannelType.PrivateThread) || command.message.channel.guildId != setup.secondary.guild.id) throw new Error("This command must be run in dead chat.");

        const db = firebaseAdmin.getFirestore();

        const col = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('threads');
        
        const channelId = (await col.doc('main').get()).data()?.channel as string | undefined;
        if(channelId == undefined) throw new Error("Threads incomplete setup.");
        const channel = await setup.secondary.guild.channels.fetch(channelId, { cache: true });
        if(channel == null || channel.type != ChannelType.GuildText) throw new Error("Threads channel not found!");

        if(command.name == "create") {
            const global = await getGlobal();
            const game = await getGameByID(global.game ?? "");

            const chats = [] as User[];

            for(let i = 1; i < command.program.args.length; i++) {
                const user = await getUserByName(command.program.args[i] as string);

                if(user == undefined) throw new Error(command.program.args[i] + " not found.");

                chats.push(user);
            }

            const threadChannel = await channel.threads.create({
                name: "chat-" + command.program.processedArgs[0] as string,
                autoArchiveDuration: 10080,
                type: ChannelType.PrivateThread,
                reason: game.name + " Mafia",
                invitable: false,
            });

            for(let i = 0; i < chats.length; i++) {
                const member = await setup.secondary.guild.members.fetch(chats[i].id);

                await threadChannel.members.add(member);
            }

            await Promise.all(setup.secondary.spec.members.map((member) => threadChannel.members.add(member)));
            await Promise.all(setup.secondary.mod.members.map((member) => threadChannel.members.add(member)));

            await col.doc(threadChannel.id).set({
                chats: chats.map(chat => chat.id),
                closed: false,
                id: threadChannel.id,
            });

        } else if(command.name == "lock" || command.name == "unlock") {
            const data = (await col.doc(command.message.channel.id).get()).data();
            const channel = command.message.channel as Channel;

            if(data == undefined || !(channel.isThread()) || data.closed == true) throw new Error("Not a thread?");

            await channel.setLocked(command.name == "lock");
        } else if(command.name == "add" || command.name == "remove") {
            const data = (await col.doc(command.message.channel.id).get()).data();
            const channel = command.message.channel as Channel;

            if(data == undefined || !(channel.isThread()) || data.closed == true) throw new Error("Not a thread?")

            const chats = data.chats;

            const user = await getUserByName(command.program.processedArgs[0] as string);

            if(user == undefined) throw new Error(command.program.processedArgs[0] + "not found.");

            if(command.name == "add" && chats.includes(user.id)) throw new Error("Already added.");
            if(command.name == "remove" && !chats.includes(user.id)) throw new Error("Already not in chat.");

            const member = await setup.secondary.guild.members.fetch(user.id);

            if(command.name == "add") {
                channel.members.add(member);

                await col.doc(channel.id).update({
                    chats: FieldValue.arrayUnion(user.id),
                });

                await channel.send("<@" + user.id + "> You have been added to this chat.")
            } else {
                channel.members.remove(member);

                await col.doc(channel.id).update({
                    chats: FieldValue.arrayRemove(user.id),
                });
            }
        } else if(command.name == "close") {
            const data = (await col.doc(command.message.channel.id).get()).data();
            const channel = command.message.channel as Channel;
            if(data == undefined || !(channel.isThread()) || data.closed == true) throw new Error("Not a thread?")

            await channel.setName("closed " + channel.name);
            await channel.setArchived(true);

            await col.doc(channel.id).update({
                closed: true,
            });
        }

        await command.message.react("✅");

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message) => {},
    onEnd: async (global, setup, game) => {
        const db = firebaseAdmin.getFirestore();

        const col = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('threads');
        
        const channelId = (await col.doc('main').get()).data()?.channel as string | undefined;
        if(channelId == undefined) throw new Error("Threads incomplete setup.");
        const channel = await setup.secondary.guild.channels.fetch(channelId, { cache: true });
        if(channel == null || channel.type != ChannelType.GuildText) throw new Error("Threads channel not found!");

        const threads = (await col.get()).docs.filter(doc => doc.id != "main").map(doc => doc.data());

        for(let i = 0; i < threads.length; i++) {
            if(threads[i] == undefined) continue;

            const thread = await channel.threads.fetch(threads[i].id).catch(() => undefined);

            if(thread == undefined) throw new Error("Not a thread?");

            const embed = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(thread.name)
                .setDescription((threads[i].chats as string[]).reduce((previous, chat) => previous + "<@" + chat + ">\n", ""));

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents([
                    new ButtonBuilder()
                        .setLabel("Join Thread")
                        .setStyle(ButtonStyle.Secondary)
                        .setCustomId(JSON.stringify({ name: "threads-join", threadId: thread.id })),
                ]);
            
            await channel.send({ embeds: [embed], components: [row] });
        }
    },
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {},
    onVotes: async (global, setup, game, board ) => { return ""; },
    onHammer: async (global, setup, game, hammered) => {},
    onRemove: async (global, setup, game, removed) => {
        const db = firebaseAdmin.getFirestore();

        const col = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('threads');
        
        const channelId = (await col.doc('main').get()).data()?.channel as string | undefined;
        if(channelId == undefined) throw new Error("Threads incomplete setup.");
        const channel = await setup.secondary.guild.channels.fetch(channelId, { cache: true });
        if(channel == null || channel.type != ChannelType.GuildText) throw new Error("Threads channel not found!");

        const threads = (await col.get()).docs.filter(doc => doc.id != "main").map(doc => doc.data());

        for(let i = 0; i < threads.length; i++) {
            if(!threads[i]) continue;

            const thread = await channel.threads.fetch(threads[i].id).catch(() => undefined);

            if(thread == undefined) throw new Error("Not a thread?")

            const member = await setup.secondary.guild.members.fetch(removed);

            if(!threads[i].chats.includes(member.id)) await thread.members.add(member);

            if(threads[i].chats.includes(removed)) {
                await col.doc(threads[i].id).update({
                    chats: FieldValue.arrayRemove(removed),
                })
            }
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
    } satisfies PermissionOverwriteOptions;
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
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
    } satisfies PermissionOverwriteOptions;
}