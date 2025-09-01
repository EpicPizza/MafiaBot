import { Command } from "commander";
import { Colors, EmbedBuilder, GuildTextBasedChannel } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../discord';
import { simpleJoin } from '../utils/text';
import { fromZod } from '../utils/text';
import client from "../discord/client";
import { Extension, ExtensionInteraction } from "../utils/extensions";
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { getGameByID, getGameSetup } from "../utils/mafia/games";
import { deleteCollection } from "../utils/mafia/main";
import { getUser, getUserByChannel, getUserByName } from "../utils/mafia/user";
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `**Player Commands**

**?whisper {name} {message}** Send a message to a player. This command can only be run within dms.

**Mod Commands**

**?whispers lock** Lock all whispers, preventing anyone from sending a whisper.

**?whispers unlock** Unlock all whispers, allowing anyone to send a whisper (with restrictions in place).

**?whispers lock match** Matches whisper lock/unlock with main chat locks/unlocks.

**?whispers block {send|receive|both}** Prevent a specific player from sending and/or receiving whipsers, default: both. Must be run in dms.

**?whispers unblock** Unblock a specific player from sending and/or receiving whipser, default: both. Must be run in dms.

**?whispers restrict {whitelist|blacklist} {send|receive|both} {nickname} {nickname...}** Restrict a player from sending and/or receiving whispers from certain players, must specify type of restriction. Must be run in dms. Using this command after using it once will overwrite previous restrictions. 

**?whispers unrestrict {send|receive|both}** Remove all restirctions from a specific player, default: both. Must be run in dms.

**?whispers cooldown {milliseconds}** Set the cooldown for sending whispers. Run in spectator chat to change global cooldown, run in specific dm to change specific players cooldown. 

**?whispers cooldown match** Reset a specific player's cooldown to match global cooldown. Must be run in dms.

**?whispers cooldown clear** Clear a specific player's cooldown if ran in DMs, or everyone's if ran in spectator chat.

**?whispers overview** Check all settings for whispers. Shows player specific settings when in dm, or global settings swhen in spectator chat.
`

module.exports = {
    name: "Whispers",
    emoji: "💬",
    commandName: "whispers",
    description: "Creates chats in dms between players.",
    shorthands: [{
        name: "whisper",
        to: "send",
    }],
    priority: [ ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        () => {
            return new Command()
                .name('send')
                .description('send a message to a player')
                .argument('[message...]', 'message', simpleJoin);
        },
        () => {
            return new Command()
                .name('lock')
                .description('lock all whispers')
                .option('--match', 'match lock with main chat lock');
        },
        () => {
            return new Command()
                .name('unlock')
                .description('unlock all whispers');
        },
        () => {
            return new Command()
                .name('block')
                .description('preven a specific player from sending and/or receiving messages')
                .argument('[type]', 'send, receive, both', fromZod(z.union([ z.literal('send'), z.literal('receive'), z.literal('both') ]) ));
        },
        () => {
            return new Command()
                .name('unblock')
                .description('unblock a specific player from sending and/or receiving messages')
                .argument('[type]', 'send, receive, both', fromZod(z.union([ z.literal('send'), z.literal('receive'), z.literal('both') ]) ));
        },
        () => {
            return new Command()
                .name('restrict')
                .description('restrict a player from sending and/or receiving whispers from certain players, must specify type of restriction')
                .argument('<restriction>', 'whitelist, blacklist', fromZod(z.union([ z.literal('whitelist'), z.literal('blacklist') ])))
                .argument('<type>', 'send, receive, both', fromZod(z.union([ z.literal('send'), z.literal('receive'), z.literal('both') ]) ))
                .argument('<players...>', 'players to restrict', simpleJoin);
        },
        () => {
            return new Command()
                .name('unrestrict')
                .description('remove all restrictions from a specific player, default: both.')
                .argument('[type]', 'send, receive, both', fromZod(z.union([ z.literal('send'), z.literal('receive'), z.literal('both') ]) ))
        },
        () => {
            return new Command()
                .name('cooldown')
                .description('set the cooldown for sending whispers, run in spectator chat to change global cooldown, run in specific dm to change specific players cooldown')
                .argument('[cooldown]', 'cooldowns in milliseconds', fromZod(z.coerce.number()))
                .option('--match', 'match cooldown to global cooldown if run in dm')
                .option('--clear', 'clear cooldown')
        },
        () => {
            return new Command()
                .name('overview')
                .description('check all settings for whispers: shows player specific settings when in dm, or global settings swhen in spectator chat');
        }
    ],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('whispers'), 20);

        const ref = db.collection('whispers').doc('settings');

        await ref.set({
            cooldown: 1000 * 60,
            locked: "match",
            actual: true,
        } satisfies Settings);

        for(let i = 0; i < game.signups.length; i++) {
            const playerRef = db.collection('whispers').doc(game.signups[i]);

            await playerRef.set({
                blocked: false,
                cooldown: 'match',
                last: 0,
                send: false,
                receive: false,
            } satisfies PlayerSettings);
        }

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {
        const settings = await getSettings();

        if(settings.locked != 'match') return;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('whispers').doc('settings');

        await ref.update({
            actual: true,
        } satisfies Partial<Settings>);
    },
    onUnlock: async (global, setup, game, incremented) => {
        const settings = await getSettings();

        if(settings.locked != 'match') return;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('whispers').doc('settings');

        await ref.update({
            actual: false,
        } satisfies Partial<Settings>);
    },
    onCommand: async (command: TextCommand) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const global = await getGlobal();

        if(global.started == false) throw new Error("Can only be run when game has started.");

        const setup = await getSetup();
        const member = await setup.primary.guild.members.fetch(command.user.id);
        
        const db = firebaseAdmin.getFirestore();

        if(command.name == "send") {
            //const game = await getGameByID(global.game ?? "");

            const player = await getUser(command.user.id);
            if(player == undefined) throw new Error("Uh, you're not found?");

            const settings = await getSettings();
            if(settings.actual == true) throw new Error("Whispers are locked!");

            const sendingTo = await getUserByName(command.program.processedArgs[0] as string);
            if(sendingTo == undefined) throw new Error("Player not found");

            const fromSettings = await getPlayerSettings(player.id);
            const toSettings = await getPlayerSettings(sendingTo.id);

            if(fromSettings.blocked == 'send' || fromSettings.blocked == 'both') throw new Error("You're blocked!");
            if(toSettings.blocked == 'receive' || toSettings.blocked == 'both') throw new Error("This person is blocked from receiving messages.");

            if(fromSettings.send != false && (fromSettings.send.type == 'blacklist' ? fromSettings.send.players.includes(sendingTo.id) : !fromSettings.send.players.includes(sendingTo.id))) throw new Error("You can't send a message to this person!");
            if(toSettings.receive != false && (toSettings.receive.type == 'blacklist' ? toSettings.receive.players.includes(player.id) : !toSettings.receive.players.includes(player.id))) throw new Error("This person can't receive a message from you!");

            const sinceLast = new Date().valueOf() - fromSettings.last;
            const cooldown = fromSettings.cooldown == 'match' ? settings.cooldown : fromSettings.cooldown;

            if(sinceLast < cooldown) throw new Error("You're still on cooldown! " + (Math.round((cooldown - sinceLast) / 100) / 10) + "s left.");

            const ref = db.collection('whispers').doc(player.id);
            await ref.update({
                last: new Date().valueOf()
            } satisfies Partial<PlayerSettings>);
 
            const embed = new EmbedBuilder()
                .setAuthor({ name: player.nickname + " whispered to you...", iconURL: member.avatarURL() ?? member.displayAvatarURL() ?? client.user?.displayAvatarURL() ?? "https://cdn.discordapp.com/avatars/1248187665548054588/cc206768cd2ecf8dfe96c1b047caa60f.webp?size=160" })
                .setDescription(command.program.args.length < 2 ? "*I don't what they whispered to you, but ig they whispered something?*" : command.program.processedArgs[1] as string);

            const channel = await setup.secondary.guild.channels.fetch(sendingTo.channel ?? "") as GuildTextBasedChannel | null;
            if(channel == null) throw new Error("Channel not found.");

            await channel.send({
                content: "<@" + sendingTo.id + ">",
                embeds: [ embed ],
            });

            await command.message.react("✅");
        } else if(command.name == "lock") {
            checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            const ref = db.collection('whispers').doc('settings');

            if(command.program.getOptionValue('match') === true) {
                const global = await getGlobal();

                await ref.update({
                    locked: 'match',
                    actual: global.locked,
                } satisfies Partial<Settings>);
            } else {
                await ref.update({
                    locked: true,
                    actual: true,
                } satisfies Partial<Settings>);
            }

            await command.message.react("✅");
        } else if(command.name == "unlock") {
            checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            const ref = db.collection('whispers').doc('settings');

            await ref.update({
                locked: false,
                actual: false,
            } satisfies Partial<Settings>);

            await command.message.react("✅");
        } else if(command.name == "block") {
            checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            const user = await getUserByChannel(command.message.channelId);
            if(user == undefined) throw new Error("Not in dm?");
            
            const userSettings = await getPlayerSettings(user.id);

            const blocking = command.program.args.length > 0 ? command.program.processedArgs[0] as 'send' | 'receive' | 'both' : "both";

            const ref = db.collection('whispers').doc(user.id);

            if(blocking == "both" || (blocking == "send" && userSettings.blocked == "receive") || (blocking == "receive" && userSettings.blocked == "send")) {
                await ref.update({
                    blocked: "both",
                } satisfies Partial<PlayerSettings>);
            } else {
                await ref.update({
                    blocked: blocking,
                } satisfies Partial<PlayerSettings>);
            }

            await command.message.react("✅");
        } else if(command.name == "unblock") {
            checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            const user = await getUserByChannel(command.message.channelId);
            if(user == undefined) throw new Error("Not in dm?");

            const userSettings = await getPlayerSettings(user.id);

            const unblocking = command.program.args.length > 0 ? command.program.processedArgs[0] as 'send' | 'receive' | 'both' : "both";

            const ref = db.collection('whispers').doc(user.id);

            if(unblocking == 'both' || (unblocking == 'send' && userSettings.blocked == 'send') || (unblocking == 'receive' && userSettings.blocked == 'receive')) {
                await ref.update({
                    blocked: false,
                } satisfies Partial<PlayerSettings>);
            } else if(unblocking == 'send' && userSettings.blocked == 'both') {
                await ref.update({
                    blocked: 'receive',
                } satisfies Partial<PlayerSettings>);
            } else if(unblocking == 'receive' && userSettings.blocked == 'both') {
                await ref.update({
                    blocked: 'send',
                } satisfies Partial<PlayerSettings>);
            }

            await command.message.react("✅");
        } else if(command.name == "restrict") {
            checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            const user = await getUserByChannel(command.message.channelId);
            if(user == undefined) throw new Error("Not in dm?");

            const type = command.program.processedArgs[0] as 'whitelist' | 'blacklist';
            const blocking = command.program.processedArgs[1] as 'send' | 'receive' | 'both';

            const nicknames = (command.program.processedArgs[2] as string).split(" ");

            const users = await Promise.all(nicknames.map(async (nickname) => {
                const fetched = await getUserByName(nickname);
                if(fetched == undefined) throw new Error("Nickname not found.");

                return fetched;
            }));

            const ref = db.collection('whispers').doc(user.id);

            if(blocking == 'send' || blocking == 'both') {
                await ref.update({
                    send: {
                        type: type,
                        players: users.map(user => user.id)
                    }
                } satisfies Partial<PlayerSettings>);
            }

            if(blocking == 'receive' || blocking == 'both') {
                await ref.update({
                    receive: {
                        type: type,
                        players: users.map(user => user.id)
                    }
                } satisfies Partial<PlayerSettings>);
            }

            await command.message.react("✅");
        } else if(command.name == "unrestrict") {
            checkMod(setup, global, command.user.id, command.message.guildId ?? "");

            const user = await getUserByChannel(command.message.channelId);
            if(user == undefined) throw new Error("Not in dm?");

            const unblocking = command.program.args.length > 0 ? command.program.processedArgs[0] as 'send' | 'receive' | 'both' : 'both';

            const ref = db.collection('whispers').doc(user.id);

            if(unblocking == 'send' || unblocking == 'both') {
                await ref.update({
                    send: false,
                } satisfies Partial<PlayerSettings>);
            }

            if(unblocking == 'receive' || unblocking == 'both') {
                await ref.update({
                    receive: false,
                } satisfies Partial<PlayerSettings>);
            }

            await command.message.react("✅");
        } else if(command.name == "cooldown") {
            checkMod(setup, global, command.user.id, command.message.guildId ?? "");
            
            if(command.program.getOptionValue('clear') === true) {
                const user = await getUserByChannel(command.message.channelId);

                const game = await getGameByID(global.game ?? "");
                const gameSetup = await getGameSetup(game, setup);
                
                const inSpectatorChat = gameSetup.spec.id == command.message.channelId;
            
                if(user == undefined && inSpectatorChat == false) throw new Error("Not in dm or spectator chat?");

                if(user) {
                    const ref = db.collection('whispers').doc(user.id);

                    await ref.update({
                        last: 0,
                    } satisfies Partial<PlayerSettings>);
                } else {
                    const global = await getGlobal();

                    const batch = db.batch();

                    global.players.forEach(player => {
                        const ref = db.collection('whispers').doc(player.id);

                        batch.update(ref, {
                            last: 0,
                        } satisfies Partial<PlayerSettings>);
                    });

                    await batch.commit();
                }
            } else if(command.program.getOptionValue('match') === true) {
                const user = await getUserByChannel(command.message.channelId);
                if(user == undefined) throw new Error("Not in dm?");

                const ref = db.collection('whispers').doc(user.id);

                await ref.update({
                    cooldown: 'match',
                } satisfies Partial<PlayerSettings>);
            } else if(command.program.args.length > 0 ) {
                const milliseconds = command.program.processedArgs[0] as number;

                const game = await getGameByID(global.game ?? "");
                const gameSetup = await getGameSetup(game, setup);

                const user = await getUserByChannel(command.message.channelId);
                const inSpectatorChat = gameSetup.spec.id == command.message.channelId;
            
                if(user == undefined && inSpectatorChat == false) throw new Error("Not in dm or spectator chat?");

                if(user) {
                    const ref = db.collection('whispers').doc(user.id);

                    await ref.update({
                        cooldown: milliseconds,
                    } satisfies Partial<PlayerSettings>);
                } else {
                    const ref = db.collection('whispers').doc('settings');

                    await ref.update({
                        cooldown: milliseconds,
                    } satisfies Partial<Settings>);
                }
            } else {
                throw new Error("Invalid arguments?");
            }

            await command.message.react("✅");
        } else if(command.name == "overview") {
            const game = await getGameByID(global.game ?? "");
            const gameSetup = await getGameSetup(game, setup);

            const user = await getUserByChannel(command.message.channelId);
            const inSpectatorChat = gameSetup.spec.id == command.message.channelId;
        
            if(user == undefined && inSpectatorChat == false) throw new Error("Not in dm or spectator chat?");

            const globalSettings = await getSettings();

            if(user) {
                const settings = await getPlayerSettings(user.id);

                const remainingCooldown =  (Math.round(((settings.cooldown == 'match' ? globalSettings.cooldown : settings.cooldown)  - (new Date().valueOf() - settings.last)) / 100) / 10);

                const nicknamesSend = settings.send != false ? await Promise.all(settings.send.players.map(async player => {
                    return (await getUser(player))?.nickname ?? "*Unknown*";
                })) : [];

                const nicknamesReceive = settings.receive != false ? await Promise.all(settings.receive.players.map(async player => {
                    return (await getUser(player))?.nickname ?? "*Unknown*";
                })) : [];

                const embed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle('Overview for ' + user.nickname)
                    .setDescription(
                        "Blocked: " + settings.blocked + "\n" +
                        "Cooldown: " + (settings.cooldown == 'match' ? "same as global" : (Math.round((settings.cooldown) / 100) / 10)) + "s" + "\n" +
                        "Remaining cooldown: " + (remainingCooldown > 0 ? remainingCooldown : 0)  + "s left." + "\n" +
                        "Send restrictions: " + (settings.send == false ? "None" : (settings.send.type == 'blacklist' ? "Blacklist " : "Whitelist ") + nicknamesSend.join(", ")) + "\n" +
                        "Receive restrictions: " + (settings.receive == false ? "None" : (settings.receive.type == 'blacklist' ? "Blacklist " : "Whitelist ") + nicknamesReceive.join(", "))
                    );

                await command.message.reply({
                    embeds: [embed],
                });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle("Overview")
                    .setDescription(
                        "Cooldown: " + (Math.round((globalSettings.cooldown) / 100) / 10) + "s" + "\n" +
                        "Lock Setting: " + (globalSettings.locked === true ? "Locked" : globalSettings.locked === false ? "Unlocked" : "Match") + "\n" +
                        "Currently: " + (globalSettings.actual === true ? "Locked" : "Unlocked")
                    );

                await command.message.reply({
                    embeds: [embed],
                });
            }
        }
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message, cache) => {},
    onEnd: async (global, setup, game) => {},
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {},
    onVotes: async (global, setup, game, board ) => { return ""; },
    onHammer: async (global, setup, game, hammered) => {},
    onRemove: async (global, setup, game, removed) => {
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('whispers').doc(removed);

        if((await ref.get()).exists) await ref.delete();
    },
} satisfies Extension;

interface Settings {
    cooldown: number,
    locked: boolean | "match",
    actual: boolean,
}

interface PlayerSettings {
    blocked: 'send' | 'receive' | 'both' | false,
    cooldown: 'match' | number,
    last: number,
    send: {
        type: 'blacklist' | 'whitelist',
        players: string[],
    } | false,
    receive: {
        type: 'blacklist' | 'whitelist',
        players: string[]
    } | false,
}

async function getSettings() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('whispers').doc('settings');

    const doc = await ref.get();

    if(doc.data() == undefined) throw new Error("Settings not set up.");

    return doc.data() as Settings;
}

async function getPlayerSettings(id: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('whispers').doc(id);

    const doc = await ref.get();

    if(doc.data() == undefined) throw new Error("Settings not set up.");

    return doc.data() as PlayerSettings;
}

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
}