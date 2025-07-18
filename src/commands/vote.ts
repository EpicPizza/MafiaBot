import { ActionRowBuilder, ApplicationCommandType, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder, time } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { set, z } from "zod";
import { getGlobal, getGameByName, lockGame, getGameByID, getAllNicknames } from "../utils/main";
import { User, getUser, getUsers, getUsersArray } from "../utils/user";
import { Vote, getVotes } from "../utils/vote";
import { Setup, getSetup } from "../utils/setup";
import { Command } from "../discord";
import { getEnabledExtensions } from "../utils/extensions";
import { Signups } from "../utils/games";
import { Global } from "../utils/main";
import { Transaction } from "firebase-admin/firestore";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-vote',
            command: new SlashCommandBuilder()
                .setName('vote')
                .setDescription('Vote for a player.')
                .addStringOption(option =>
                    option  
                        .setName('player')
                        .setDescription('Which player to vote for?')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        },
        { 
            type: 'slash',
            name: 'slash-unvote',
            command: new SlashCommandBuilder()
                .setName('unvote')
                .setDescription('Remove your vote.')
        },
        {
            type: 'context',
            name: 'context-Vote',
            command: new ContextMenuCommandBuilder()
                .setName('Vote')
                 .setType(ApplicationCommandType.User)
        },
        {
            type: 'text',
            name: 'text-vote',
            command: {
                optional: [ z.string().min(1).max(100) ]
            }
        },
        {
            type: 'text',
            name: 'text-unvote',
            command: {}
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction | Command | AutocompleteInteraction) => {
        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused();

            const nicknames = await getAllNicknames();

            const filtered = nicknames.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase())).slice(0, 25);;

            await interaction.respond(
                filtered.map(choice => ({ name: choice, value: choice })),
            );

            return;
        }

        const player = (() => {
            if('arguments' in interaction) {
                return interaction.arguments[0] ?? null;
            } else if (interaction.isChatInputCommand()) {
                return interaction.options.getString('player');
            } else {
                return interaction.targetId;
            }
        })();

        const global = await getGlobal();

        if(global.started == false) {
            if(player != null) {
                if('arguments' in interaction) {
                    await interaction.message.react("✅");
                } else if (interaction.isChatInputCommand()) {
                    await interaction.reply("Voted for " + interaction.options.getString('player'));
                } else {
                    await interaction.reply("Voted for <@" + interaction.targetId + ">");
                }
            } else {
                throw new Error("Player must be specified.");
            }

            return;
        }

        if(global.locked == true) throw new Error("Game is locked!");
        if(global.grace == true) throw new Error("Game is in grace period.");

        if(interaction.type != 'text') { 
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
        
        const setup = await getSetup();
        const game = await getGameByID(global.game ?? "");

        if('arguments' in interaction) {
            if(interaction.message.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        } else {
            if(interaction.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        }

        const users = await getUsersArray(global.players.map(player => player.id));

        const author = ('arguments' in interaction) ? interaction.message.author : interaction.user;

        const voting = users.find(user => (typeof player == 'string' ? user.nickname.toLowerCase() == player.toLowerCase() || user.id == player || (player.startsWith("<@") && player.length > 4 && player.substring(2, player.length - 1) == user.id) : false));
        const voter = users.find(user => user.id == author.id);

        const extensions = await getEnabledExtensions(global);

        const extension = extensions.find(extension => extension.priority.includes("onVote"));

        const db = firebaseAdmin.getFirestore();

        const type = (!('arguments' in interaction) ? interaction.commandName == "unvote" : (interaction.name == "unvote" || interaction.arguments.length == 0)) ? "unvote" : "vote";
        
        if(type == 'vote' && voting == undefined) throw new Error("Must specify someone to vote!");
        if(voter == undefined) throw new Error("Must specify voter?");

        const hammer = await db.runTransaction(async t => {
            const { vote, votes } = await flow.placeVote(t, voter, voting, type, global.day); // doesn't save vote yet since board needs to be created

            const board = flow.board(votes, users);

            flow.finish(t, vote, board, global.day); // locks in vote

            return flow.determineHammer(t, vote, votes, users);
        });

        

        /*if(voter && vote && (!('arguments' in interaction) ? interaction.commandName == "unvote" : (interaction.name == "unvote" || interaction.arguments.length == 0) )) {
            removeVote({ id: author.id, day: global.day });

            const previous = fullList.find(user => user.id == vote.for);

            let message = voter.nickname + " removed vote for " + (previous?.nickname ?? "<@" + vote.for + ">") + "!";

            const setMessage = await addVoteLog({ message, id: author.id, day: global.day, for: null, type: "unvote" });

            if(extension == undefined) {
                if('arguments' in interaction) {
                    await interaction.message.react("✅");

                    await setMessage(interaction.message.id);

                    return;
                } else {
                    await interaction.editReply(message);
                    
                    await setMessage((await interaction.fetchReply()).id);

                    return;
                }
            } else {
                const result = await extension.onVote(votes, vote, false, global, setup, game) as { hammer: boolean, message: string | null, hammered: string };

                if('arguments' in interaction) {
                    await interaction.message.react("✅");
                    
                    if(!result.hammer && result.message) await setup.primary.chat.send(result.message);

                    await setMessage(interaction.message.id);
                } else {
                    await interaction.editReply(message + (!result.hammer && result.message ? result.message : ""));

                    await setMessage((await interaction.fetchReply()).id);
                }

                if(result.hammer) {
                    await lockGame();
                    await hammerExtensions(global, setup, game, result.hammered);

                    if(result.message) {
                        await setup.primary.chat.send(result.message);
                    } else {
                        await setup.primary.chat.send("Game has been locked by " + extension.name + " Extension.");
                    }
                }
            }

            return;
        } else if((!('arguments' in interaction) ? interaction.commandName == "unvote" : (interaction.name == "unvote" || interaction.arguments.length == 0) )) {
            if('arguments' in interaction) {
                return await interaction.message.react("❎");
            } else {
                return await interaction.editReply("No vote found.");
            }
        }

        if(!user || !voter) {
            if(!voter) {
                throw new Error("You're not part of this game!");
            } else {
                throw new Error("Player not found.");
            }
        } else {
            let voted = false;

            if(vote == undefined) {
                await setVote({ for: user.id, id: author.id, day: global.day });
                
                votes.push({ for: user.id, id: author.id, timestamp: new Date().valueOf() }); //it doesn't really matter the timestamp :/

                voted = true;
            } else {
                await removeVote({ id: author.id, day: global.day });

                votes = votes.filter(vote => vote.id != author.id);

                voted = false;

                if(vote.for != user.id) {
                    await setVote({ for: user.id, id: author.id, day: global.day });
                
                    votes.push({ for: user.id, id: author.id, timestamp: new Date().valueOf() });

                    voted = true;
                }
            }

            let message = voter.nickname + (voted ? " voted for " : " removed vote for ") + user.nickname + "!";

            const setMessage = await addVoteLog({ message, id: author.id, day: global.day, type: voted ? "vote" : "unvote", for: voted ? user.id : null });

            if(extension == undefined) {
                let votesForHammer = votes.filter(vote => vote.for == user.id);
                let half = list.length / 2;
                if(half % 1 == 0) half += 0.5;

                if('arguments' in interaction) {
                    if(voted) {
                        await interaction.message.react("✅");
                    } else {
                        await interaction.message.react("🗑️");
                    }

                    await setMessage(interaction.message.id);
                } else {
                    await interaction.editReply(message);

                    await setMessage((await interaction.fetchReply()).id);
                }
                
                if(votesForHammer.length >= half) {
                    await lockGame();
                    await hammerExtensions(global, setup, game, user.id);

                    await new Promise((resolve) => {
                        setTimeout(() => {
                            resolve(true);
                        }, 2000);
                    });

                    await setup.primary.chat.send(user.nickname + " has been hammered!");
                }
            } else {
                const result = await extension.onVote(votes, { for: user.id, id: voter.id, timestamp: new Date().valueOf() }, true, list, global, setup, game) as { hammer: boolean, message: string | null, hammered: string };

                if('arguments' in interaction) {
                    if(voted) {
                        await interaction.message.react("✅");
                    } else {
                        await interaction.message.react("🗑️");
                    }

                    await setMessage(interaction.message.id);

                    if(!result.hammer && result.message) await setup.primary.chat.send(result.message);
                } else {
                    await interaction.editReply(message + (!result.hammer && result.message ? result.message : ""));

                    await setMessage((await interaction.fetchReply()).id);
                }

                if(result.hammer) {
                    await lockGame();
                    await hammerExtensions(global, setup, game, result.hammered);

                    if(result.message) {
                        await setup.primary.chat.send(result.message);
                    } else {
                        await setup.primary.chat.send(user.nickname + " has been hammered!");
                    }
                }
            }
        }*/   
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

const flow = {
    placeVote: async (t: Transaction, voter: User, voting: User | undefined, type: 'unvote' | 'vote', day: number) => {
        const votes = await getVotes(t, { day: day });

        if(type != 'unvote' && voting == undefined) throw new Error("Voter must be specified!")
 
        const existing = votes.findIndex(vote => vote.for == voter.id);

        if(existing > -1) {
            votes.splice(existing, 1);
        } 
        
        let vote: Vote;

        if(type != 'unvote' && voting) {
            vote = {
                for: voting.id,
                id: voter.id,
                timestamp: new Date().valueOf(),
            };

            votes.push(vote)
        } else {
            vote = {
                for: "unvote",
                id: voter.id,
                timestamp: new Date().valueOf(),
            };
        }

        return {
            vote,
            votes,
        }
    },
    board: (votes: Vote[], users: User[]) => {
        const counting = [] as { voting: string, voters: string[]}[];

        const all = [...new Set(votes.map(vote => vote.for))];

        all.forEach(votingId => {
            const voting = users.find(user => user.id == votingId)?.nickname ?? "<@" + votingId + ">";

            counting.push({
                voting,
                voters: votes.filter(vote => vote.for == votingId).sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf()).map(voter => users.find(user => user.id == voter.id)?.nickname ?? "<@" + votingId + ">"),
            });
        });

        counting.sort((a, b) => b.voters.length - a.voters.length);

        const board = counting.reduce((prev, curr) => prev += (curr.voters.length + " - " + curr.voting + " « " + curr.voters.join(", ")) + "\n", "");

        return board;
    },
    finish: (t: Transaction, vote: Vote, board: string, day: number) => {
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('day').doc(day.toString()).collection('votes').doc();

        t.create(ref, {
            board,
            vote,
            messageId: null,
        });
    },
    determineHammer: (t: Transaction, vote: Vote, votes: Vote[], users: User[]) => {
        let votesForHammer = votes.filter(v => v.for == vote.for);
        let half = users.length / 2;
        if(half % 1 == 0) half += 0.5;

        if(votesForHammer.length >= half) {
            return {
                message: users.find(user => vote.for == user.id)?.nickname ?? "<@" + vote.for + ">" + " has been hammered!",
                hammer: true,
            }
        } else {
            return {
                message: null,
                hammer: false,
            }
        }
    }
}