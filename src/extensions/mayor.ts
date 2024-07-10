import { ChannelType, ChatInputCommandInteraction, EmbedBuilder, Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getAllUsers, getGameByID, getGlobal } from "../utils/main";
import { z } from "zod";
import { firebaseAdmin } from "../firebase";
import { Setup, getSetup } from "../utils/setup";
import { Signups, getGameSetup } from "../utils/games";
import { Global } from "../utils/main"
import { User, getUser, getUserByChannel, getUserByName, getUsers, getUsersArray } from "../utils/user";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `This extension can support mayor in three different ways: hidden, secret, or classic. 
- hidden - The mayor is always kept hidden with their extra votes always counted. 
- secret - Works similarly to hidden, except the mayor has the ability to reveal that they are mayor. 
- classic - Their extra votes are not counted until they reveal that they are mayor.

**?mayor set {type} {weight}** Type indicates the mayor behavior: hidden, secret or classic. Weight is how many votes the mayor will count for, minimum 1 and whole numbers only. Must be run by the mod, inside the dm that is mayor.

**?mayor check** List out all the mayors set. Must be run in dead chat channel.

**?mayor reveal** Command used by player to reveal they are mayor.

**Additional Notes:** When running votes command in dead chat, hidden and secret mayors will be shown.`

module.exports = {
    name: "Mayors",
    emoji: "🗳️",
    commandName: "mayor",
    description: "Includes mayors and similar roles in games.",
    priority: [ "onVote", "onVotes" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "set",
            arguments: {
                required: [ z.literal("hidden").or(z.literal("secret")).or(z.literal("classic")), z.coerce.number().int().min(1) ],
            }
        }, {
            name: "check",
            arguments: {},
        }, {
            name: "reveal",
            arguments: {},
        }
    ] satisfies CommandOptions[],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('mayor'), 20);

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
        const member = await setup.primary.guild.members.fetch(command.user.id);
        const game = await getGameByID(global.game ?? "");

        if(command.name == "set") {
            if(!member?.roles.cache.has(setup.primary.mod.id)) throw new Error("You're not a mod!");
            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

            const user = await getUserByChannel(command.message.channel.id);

            if(!user) throw new Error("This dm channel is not linked to a user.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('mayor').doc(user.id);
            
            await ref.set({
                type: command.arguments[0] as string,
                weight: command.arguments[1] as string,
                reveal: false,
            });

            await command.message.react("✅");
        } else if(command.name == "check") {
            const gameSetup = await getGameSetup(game, setup);

            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != gameSetup.spec.guildId || command.message.channel.id != gameSetup.spec.id) throw new Error("This command must be run in dead chat.");

            const mayors = await getMayors(await getAllUsers(game));

            let message = mayors.reduce((prev, mayor) => prev + (mayor.nickname ?? "<@" + mayor.id + ">") + " - " + capitalize(mayor.type) + " (" + mayor.weight + ")\n", "");

            const embed = new EmbedBuilder()
                .setTitle("Mayor List")
                .setColor("NotQuiteBlack")
                .setDescription(message == "" ? "No Mayors" : message);

            await command.message.reply({ embeds: [embed] });
        } else if(command.name == "reveal") {
            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('mayor').doc(command.user.id);

            const data = (await ref.get()).data();

            if(!data || !(data.type == 'secret' || data.type == 'classic') || data.reveal == true) return;
            
            await ref.update({
                reveal: true,
            });

            await command.message.react("✅");
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

        if(!user) throw new Error("User not found.");

        const mayors = await getMayors(users);

        let votesForHammer = votes.reduce((prev, vote) => {
            const mayor = mayors.find(mayor => mayor.id == vote.id);

            if(mayor && (mayor.type != "classic" || ("classic" && mayor.reveal == true))) {
                return prev + mayor.weight;
            } else {
                return prev + 1;
            }
        }, 0);

        let half = users.length / 2;
        if(half % 1 == 0) half += 0.5;

        return { hammer: votesForHammer >= half, message: votesForHammer >= half ? user.nickname + " has been hammered!" : null, hammered: user.id };

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

        const mayors = await getMayors(); //blah blah blah extra setps blah blah idc

        const message = { description: "", footer: "" };

        const gameSetup = await getGameSetup(game, setup);

        const checking = command.type == 'text' ? command.message : command;

        const deadChat = !(checking.channel?.type != ChannelType.GuildText || checking?.channel.guildId != gameSetup.spec.guildId || checking?.channel.id != gameSetup.spec.id);

        for(let i = 0; i < voting.length; i++) {
            const voted = votes.get(voting[i]) ?? [];

            let count = 0;

            const voters = voted.reduce((previous, current) => {
                const mayor = mayors.find(mayor => mayor.id == current.id);

                if(mayor && (((mayor.type == "classic" || mayor.type == "secret") && mayor.reveal == true) || (deadChat && (mayor.type != "classic" || ("classic" && mayor.reveal == true))))) {
                    count += mayor.weight;
                } else {
                    count++;
                }

                const indicator = (() => {
                    if(!mayor) {
                        return ""
                    } else if((mayor.type == "classic" || mayor.type == "secret") && mayor.reveal == true) {
                        return " (" + mayor.weight + ")"
                    } else if(deadChat && (mayor.type == "hidden" || (mayor.type == "secret" && mayor.reveal == false))) {
                        return " ~~(" + mayor.weight + ")~~"
                    } else if(deadChat && mayor.type == "classic" && mayor.reveal == false) {
                        return " *(" + mayor.weight + ")*";
                    } else {
                        return "";
                    }
        
                })();

                return previous += (users.get(current.id)?.nickname ?? "<@" + current + ">") + indicator + ", "
            }, "");

            message.description += count + " - " + (users.get(voting[i])?.nickname ?? "<@" + voting[i] + ">") + " « " + voters;

            message.description = message.description.substring(0, message.description.length - 2);

            message.description += "\n";
        }

        if(message.description == "") {
            message.description = "No votes recorded.";
        }

        let half = global.players.length / 2;
        if(half % 1 == 0) half += 0.5;
        half = Math.ceil(half);

        message.footer = "Hammer is at " + half + " vote" + (half == 1 ? "" : "s") + "."
        
        return message;

        /**
         * A string that will replace the votes list in votes command.
         */
    },
    onHammer: async (global, setup, game, hammered: string) => {},
    onRemove: async (global, setup, game, removed: string) => {}
}

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
}

async function getMayors(users: User[] | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    const docs = (await db.collection('mayor').get()).docs;

    const mayors = new Array<{ id: string, nickname: string | undefined, reveal: boolean, type: 'classic' | 'secret' | 'hidden', weight: number }>();

    for(let i = 0; i < docs.length; i++) {
        const user = users ? users.find(user => user.id == docs[i].id) : undefined;

        mayors.push({
            nickname: user?.nickname,
            id: docs[i].id,
            reveal: docs[i].data().reveal,
            type: docs[i].data().type,
            weight: docs[i].data().weight,
        });
    }

    return mayors;
}