import { ChannelType, ChatInputCommandInteraction, EmbedBuilder, Message } from "discord.js";
import { addVoteLog, getVotes, removeVote, setVote, Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getAllUsers, getGameByID, getGlobal, lockGame } from "../utils/main";
import { z } from "zod";
import { firebaseAdmin } from "../firebase";
import { Setup, getSetup } from "../utils/setup";
import { Signups, getGameSetup } from "../utils/games";
import { Global } from "../utils/main"
import { User, getUser, getUserByChannel, getUserByName, getUsers, getUsersArray } from "../utils/user";
import { checkMod } from "../utils/mod";
import { Extension, getEnabledExtensions } from "../utils/extensions";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `**?skip** Allows a player to skip vote.

**?skipping hammer {on|off}** If autohammer is enabled or not.

**?skipping type {hammer|nothing}** If number of skip votes reach hammer level, if it should skip day (hammer) or not (nothing). No effect if autohammer is off.

**?skipping check** See all settings.`

module.exports = {
    name: "Skip",
    emoji: "⏩",
    commandName: "skipping",
    shorthands: [
        {
            name: "skip", 
            to: "vote"
        }
    ],
    description: "Adds a skip option to the game.",
    priority: [ "onVote", "onVotes" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "vote",
            arguments: {}
        }, {
            name: "hammer",
            arguments: {
                required: [ z.union([ z.literal('on'), z.literal('off') ]) ]
            },
        }, {
            name: "type",
            arguments: {
                required: [ z.union([ z.literal('hammer'), z.literal('nothing') ]) ]
            },
        }, {
            name: "check",
            arguments: {}
        }
    ] satisfies CommandOptions[],
    onStart: async (global, setup, game: Signups) => {
        /**
         * Runs during game start processes.
         */

        if(!game.signups.find(signup => signup == alt)) throw new Error("Skip Extension: Alt not found, extension will not work without alt. Please restart game with alt.");

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('skip'), 20);

        const ref = db.collection('skip').doc('settings');

        await ref.set({
            hammer: 'on',
            type: 'nothing',
        })

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
        const member = await setup.primary.guild.members.fetch(command.user.id);

        if(command.name == "hammer") {
            checkMod(setup, command.user.id, command.message.guildId ?? "");

            const setting = command.arguments[0] as 'on' | 'off';

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('skip').doc('settings');
            
            await ref.update({
                hammer: setting,
            });

            await command.message.react("✅");
        } else if(command.name == "type") {
            checkMod(setup, command.user.id, command.message.guildId ?? "");

            const setting = command.arguments[0] as 'hammer' | 'nothing';

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('skip').doc('settings');
            
            await ref.update({
                type: setting,
            });

            await command.message.react("✅");
        } else if(command.name == "check") { 
            const settings = await getSettings();

            const embed = new EmbedBuilder()
                .setTitle('Skip Settings')
                .setDescription('Type: *' + settings.type + '*\nHammer: *' + settings.hammer + '*')

            await command.reply({ embeds: [embed] });
        } else if(command.name == "vote") {
            const global = await getGlobal();
            const game = await getGameByID(global.game ?? "");

            if(global.locked == true) throw new Error("Game is locked!");

            if(global.grace == true) throw new Error("Game is in grace period.");

            const list = await getUsersArray(global.players.map(player => player.id));

            const voter = list.find(user => user.id == member.id);
            
            let votes = await getVotes({ day: global.day });
            const vote = votes.find(vote => vote.id == member.id);

            if(!voter) throw new Error("You're not part of this game!");

            let voted = false;

            if(vote == undefined) {
                await setVote({ for: alt, id: member.id, day: global.day });
                votes.push({ for: alt, id: member.id, timestamp: new Date().valueOf() });
                voted = true;
            } else {
                await removeVote({ id: member.id, day: global.day });
                votes = votes.filter(vote => vote.id != member.id);
                voted = false;

                if(vote.for != alt) {
                    await setVote({ for: alt, id: member.id, day: global.day });
                    votes.push({ for: alt, id: member.id, timestamp: new Date().valueOf() });
                    voted = true;
                }
            }

            let message = voter.nickname + (voted ? " voted to skip!" : " removed their skip vote!");

            const setMessage = await addVoteLog({ message, id: member.id, day: global.day, type: voted ? "vote" : "unvote", for: voted ? alt : null });

            const settings = await getSettings();

            if(voted) {
                await command.message.react("✅");
            } else {
                await command.message.react("🗑️");
            }

            if(settings.type == 'hammer' && settings.hammer == 'on') {
                let votesForHammer = votes.filter(vote => vote.for == alt);
                let half = (list.length - 1) / 2;
                if(half % 1 == 0) half += 0.5;

                if(votesForHammer.length >= half) {
                    await lockGame();
                    await hammerExtensions(global, setup, game, alt);

                    await new Promise((resolve) => {
                        setTimeout(() => {
                            resolve(true);
                        }, 2000);
                    });

                    await setup.primary.chat.send("No one was voted out!");
                }
            }

            await setMessage(command.message.id);
        }

        /**
         * Nothing to return.
         */
    },
    onMessage: async (message: Message, cache: Cache) => {},
    onEnd: async (global, setup, game) => {
        /**
         * Runs during game end processes.
         */

        console.log("Extension End");

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (votes: Vote[], vote: Vote | undefined, voted: boolean, users: User[], global, setup, game) => {
        /**
         * Runs after vote is counted, before vote/hammer is annouced.
         * 
         * vote: { id: string, for: string, timestamp: number }[]
         */

        if(!voted || vote == undefined) return { hammer: false, message: null };

        const user = users.find(user => user.id == vote.id);
        const votedFor = users.find(user => user.id == vote.for);

        if(!user || !votedFor) throw new Error("User not found.");

        const votesForHammer = votes.filter(vote => vote.for == votedFor.id).length;

        let half = (global.players.length - 1) / 2;
        if(half % 1 == 0) half += 0.5;
        half = Math.ceil(half);

        const settings = await getSettings();

        if(vote.for == alt && settings.type == 'hammer' && settings.hammer == 'on') {
            return { hammer: votesForHammer >= half, message: votesForHammer >= half ? "No one was voted out!" : null, hammered: alt };
        } else if(vote.for == alt) {
            return { hammer: false, message: null, hammered: alt };
        } else if(vote.for != alt && settings.hammer == 'on') {
            return { hammer: votesForHammer >= half, message: votesForHammer >= half ? votedFor.nickname + " has been hammered!" : null, hammered: user.id };
        } else {
            return { hammer: false, message: null, hammered: user.id };
        }

        /**
         * hammer: boolean - Tells to hammer or not.
         * message: string | null - Message to append to vote/hammer, null will return default.
         */
    },
    onVotes: async (voting: string[], votes: Map<string, Vote[]>, day: number, users: Map<string, User>, global: Global, setup: Setup, game: Signups, command: ChatInputCommandInteraction | Command) => {
        /**
         * Runs while processing votes command.
         * 
         * voting: string[] - array of each voted person's id
         * votes: Map<string, Vote[]> - array of votes for each voted person, key is person's id
         */
        const message = { description: "", footer: "" };

        for(let i = 0; i < voting.length; i++) {
            const voted = votes.get(voting[i]) ?? [];

            let count = 0;

            const votingName = voting[i] == alt ? "*Skip*" : (users.get(voting[i])?.nickname ?? "<@" + voting[i] + ">");

            const voters = voted.reduce((previous, current) => {
                count++;

                return previous += (users.get(current.id)?.nickname ?? "<@" + current + ">") + ", "
            }, "");

            message.description += count + " - " + votingName + " « " + voters;

            message.description = message.description.substring(0, message.description.length - 2);

            message.description += "\n";
        }

        if(message.description == "") {
            message.description = "No votes recorded.";
        }

        const settings = await getSettings();

        if(settings.hammer == 'on') {
            let half = (global.players.length - 1) / 2;
            if(half % 1 == 0) half += 0.5;
            half = Math.ceil(half);
    
            message.footer = "Hammer is at " + half + " vote" + (half == 1 ? "" : "s") + "."
        } else {
            message.footer = "Autohammer is turned off.";
        }
        
        return message;

        /**
         * A string that will replace the votes list in votes command.
         */
    },
    onHammer: async (global, setup, game, hammered: string) => {},
    onRemove: async (global, setup, game, removed: string) => {
        if(removed == alt) {
            throw new Error("Uhhhh, you weren't supposed to remove the alt.");
        }
    }
} satisfies Extension;

const alt = "1320184382774050886";

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
}

async function getSettings() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('skip').doc('settings');

    const data = (await ref.get()).data();

    if(data == undefined) throw new Error("No settings.");

    return {
        hammer: data.hammer as 'on' | 'off',
        type: data.type as 'hammer' | 'nothing',
    }
}

async function hammerExtensions(global: Global, setup: Setup, game: Signups, hammered: string) {
    const extensions = await getEnabledExtensions(global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onHammer(global, setup, game, hammered)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}