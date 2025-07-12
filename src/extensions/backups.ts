import { ChannelType, Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions, removeReactions } from "../discord";
import { deleteCollection, getGameByID, getGlobal, getPlayerObjects, lockGame, setMafiaSpectator, setupDeadPlayer, setupMafiaPlayer, setupMainPlayer, unlockGame } from "../utils/main";
import { z } from "zod";
import { Setup, getSetup } from "../utils/setup";
import { User, getUser, getUserByChannel, getUserByName } from "../utils/user";
import { firebaseAdmin } from "../firebase";
import { Global } from "../utils/main";
import { Signups, addSignup, getGameSetup } from "../utils/games";
import { FieldValue } from "firebase-admin/firestore";
import { addMafiaPlayer } from "../commands/mod/alignments";
import { Extension, ExtensionInteraction, getEnabledExtensions } from "../utils/extensions";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `**?backup queue {nickname} {nicknames...}** Queue a backup player, removing them from spectator channels as if they were playing the game as usual. If adding multiple players, seperate nicknames with a space, max 5 people.

**?backup replace {nickname} with {nickname}** Add a queued player to the game. Backup player will use the same dm channel as original player.

**?backup complete** Original player will be given spectator perms and be removed from dm. (Runs in dm.)

**Additional Notes:** 
- For a player to queued, they need to be registered with the bot, which basically means the player needs to have set a nickname before.
- Other extensions will see the replaced player as a new player, so you may need to rerun commands, such as resetting mayor and readding the player to whispers.
`

module.exports = {
    name: "Backups",
    emoji: "💾",
    commandName: "backup",
    description: "Adds backup players for replacing inactive players.",
    priority: [ ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "queue",
            arguments: {
                required: [ z.string().min(1).max(100) ],
                optional: Array(4).fill(z.string().min(1).max(100))
            }
        },
        {
            name: "replace",
            arguments: {
                required: [ z.string().min(1).max(100), z.literal("with"), z.string().min(1).max(100)  ],
            },
        },
        {
            name: "complete",
            arguments: {}
        }
    ] satisfies CommandOptions[],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('backups'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {},
    onUnlock: async (global, setup, game, incremented: boolean) => {},
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const setup = await getSetup();
        const global = await getGlobal();

        if(global.game == null) return;

        const game = await getGameByID(global.game);
        const gameSetup = await getGameSetup(game, setup);

        await command.message.react("<a:loading:1256150236112621578>");
        
        if(command.name == "queue") {
            const users = [] as User[];

            for(let i = 0; i < command.arguments.length; i++) {
                const user = await getUserByName(command.arguments[i] as string);

                if(user == undefined) throw new Error(command.arguments[i] + "not found.");
                if(global.players.find(player => player.id == user.id)) throw new Error(command.arguments[i] + " is already part of the game.");

                users.push(user);
            }

            for(let i = 0; i < users.length; i++) {
                const { deadPlayer, userProfile, player, mafiaPlayer } = await getPlayerObjects(users[i].id, setup);

                await setupDeadPlayer(deadPlayer, setup)
                await setupMafiaPlayer(mafiaPlayer, setup, gameSetup);
                
                const db = firebaseAdmin.getFirestore();

                const ref = db.collection("backups").doc(userProfile.id);

                await ref.set({
                    queued: true,
                });
            }
        } else if(command.name == "replace") {
            const ingame = !global.locked;

            if(global.day == 0) throw new Error("Setup alignments first.");

            const replacing = await getUserByName(command.arguments[0] as string);
            const to = await getUserByName(command.arguments[2] as string);

            if(replacing == undefined || to == undefined) throw new Error("Player(s) not found.");

            const db = firebaseAdmin.getFirestore();

            if((await db.collection('backups').doc(to.id).get()).data()?.queued != true) throw new Error("Player not queued.");

            if(ingame) await lockGame();
            const message = await setup.primary.chat.send("Replacing " + replacing.nickname + " with " + to.nickname + ". <a:loading:1256150236112621578>");   

            await db.collection('settings').doc('game').collection('games').doc(global.game).update({ signups: FieldValue.arrayUnion(to.id) });

            const days = await db.collection('day').listDocuments();

            for(let day = 0; day < days.length; day++) {
                const votes = (await days[day].collection('votes').get()).docs;

                for(let vote = 0; vote < votes.length; vote++) {
                    if(votes[vote].id == replacing.id) {
                        const voteData = votes[vote].data();

                        if(!voteData) continue;

                        if(voteData.for == replacing.id) voteData.for = to.id;
                        if(voteData.id == replacing.id) voteData.id = to.id;

                        days[day].collection('votes').doc(to.id).set(voteData);

                        await votes[vote].ref.delete();
                    }
                }

                const logs = (await days[day].collection('votes').doc('history').collection('logs').get()).docs;

                for(let log = 0; log < logs.length; log++) {
                    if(logs[log].data()?.id == replacing.id) {
                        await logs[log].ref.update({
                            id: to.id,
                        });
                    }

                    if(logs[log].data()?.for == replacing.id) {
                        await logs[log].ref.update({
                            for: to.id,
                        });
                    }
                }

                const players = await days[day].collection('players').listDocuments();

                for(let player = 0; player < players.length; player++) {
                    if(players[player].id == replacing.id) {
                        days[day].collection('players').doc(to.id).set((await players[player].get()).data() ?? {});

                        await players[player].delete();
                    }
                }
            }

            const channel = await setup.secondary.guild.channels.fetch(replacing.channel ?? "").catch(() => undefined);

            if(!channel || channel.type != ChannelType.GuildText) throw new Error("DM channel not found.");

            //await channel.setName(to.nickname.toLowerCase());
            //await channel.setTopic(replacing.nickname + " Backup");

            await db.collection('users').doc(to.id).update({ channel: replacing.channel });
            await db.collection('users').doc(replacing.id).update({ channel: to.channel });

            await channel.permissionOverwrites.create(to.id, messageOverwrites());

            for(let i = 0; i < global.players.length; i++) {
                if(global.players[i].id == replacing.id) {
                    await db.collection('settings').doc('game').update({
                        players: FieldValue.arrayRemove(global.players[i]),
                    });

                    await db.collection('settings').doc('game').update({
                        players: FieldValue.arrayUnion({ id: to.id, alignment: global.players[i].alignment })
                    });

                    if(global.players[i].alignment == 'mafia') {
                        await addMafiaPlayer(global.players[i], setup);

                        const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia, { unique: true });

                        await channel.send("<@" + to.id + "> Looks like the player you are replacing is mafia! Here is the invite link for mafia server: \nhttps://discord.com/invite/" + invite.code);
                    } else {
                        await channel.send("<@" + to.id + "> Here is the dm channel of the player you are replacing.");
                    }
                }
            }

            await db.collection('backups').doc(to.id).update({
                swapped: true,
                swapping: replacing.id,
            });

            const { player } = await getPlayerObjects(to.id, setup);

            await setupMainPlayer(player, setup);

            await message.edit("Replacing " + replacing.nickname + " with " + to.nickname + ". ✅");

            if(ingame) await unlockGame(false, false);
        } else if(command.name == "complete") {
            const user = await getUserByChannel(command.message.channelId);

            if(!user) throw new Error("User not found.");

            const db = firebaseAdmin.getFirestore();

            const swap = await db.collection('backups').doc(user.id).get()

            if(swap.data()?.swapped != true) throw new Error("This player has not been replaced.");

            const replacing = await getUser(swap.data()?.swapping as string);
            const to = await getUser(swap.id as string);

            if(replacing == undefined || to == undefined) throw new Error("Player(s) not found.");

            const channel = await setup.secondary.guild.channels.fetch(to.channel ?? "").catch(() => undefined); //opposite from replace command, since replaced player dm is now backup player dm

            if(!channel || channel.type != ChannelType.GuildText) throw new Error("DM channel not found.");

            await channel.permissionOverwrites.delete(replacing.id);

            const main = await setup.primary.guild.members.fetch(replacing.id).catch(() => undefined);
            if(main == null) throw new Error("Member not found.");
            await main.roles.remove(setup.primary.alive);

            const dead = await setup.secondary.guild.members.fetch(replacing.id).catch(() => undefined);
            if(dead == null) throw new Error("Member not found.");
            await dead.roles.add(setup.secondary.spec);

            const mafia = await setup.tertiary.guild.members.fetch(replacing.id).catch(() => undefined);
            await setMafiaSpectator(mafia, main.id, setup, gameSetup, replacing);

            onRemove(global, setup, game, replacing.id);
        }

        await removeReactions(command.message);

        await command.message.react("✅")

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message: Message, cache: Cache) => {},
    onEnd: async (global, setup: Setup, game) => {
        const db = firebaseAdmin.getFirestore();

        const swaps = (await db.collection('backups').where('swapped', '==', true).get()).docs;

        for(let i = 0; i < swaps.length; i++) {
            const replacing = await getUser(swaps[i].data().swapping as string);
            const to = await getUser(swaps[i].id as string);

            if(replacing == undefined || to == undefined) throw new Error("Player(s) not found.");

            const channel = await setup.secondary.guild.channels.fetch(to.channel ?? "").catch(() => undefined); //opposite from replace command, since replaced player dm is now backup player dm

            if(!channel || channel.type != ChannelType.GuildText) throw new Error("DM channel not found.");

            //await channel.setName(replacing.nickname);
            //await channel.setTopic(null);

            await db.collection('users').doc(to.id).update({ channel: replacing.channel });
            await db.collection('users').doc(replacing.id).update({ channel: to.channel });

            await db.collection('settings').doc('game').collection('games').doc(game.id).update({ signups: FieldValue.arrayRemove(to.id) });
        }
    },
    onVote: async (votes: Vote[], vote: Vote ,voted: boolean, global, setup, game) => {},
    onVotes: async (voting: string[], votes: Map<string, Vote[]>, day: number, global, setup, game) => {},
    onHammer: async (global: Global, setup: Setup, game, hammered: string) => {},
    onRemove: async (global, setup, game, removed: string) => {}
} satisfies Extension;

function messageOverwrites() {
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

export async function onRemove(global: Global, setup: Setup, game: Signups, removed: string) {
    const extensions = await getEnabledExtensions(global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onRemove(global, setup, game, removed)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}