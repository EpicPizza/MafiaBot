import { ChatInputCommandInteraction, SlashCommandStringOption, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getAllUsers, getGameByID, getGlobal, lockGame, setupPlayer } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, getUserByName, getUsersArray, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";
import { FieldValue } from "firebase-admin/firestore";
import { addVoteLog, getVotes, removeVote, setVote } from "../../utils/vote";

export const VoteCommand = {
    name: "vote",
    description: "?adv vote {player} {add|remove} {for}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("vote")
            .setDescription("Add a player midgame.")
            .addStringOption(option =>
                option
                    .setName("player")
                    .setDescription("Which player to vote as.")
                    .setRequired(true)
                    .setAutocomplete(true))
            .addStringOption(option =>
                option
                    .setName('type')
                    .setDescription('What type of vote to do.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'add', value: 'add' },
                        { name: 'remove', value: 'remove' },
                    ))
            .addStringOption(option =>
                option
                    .setName("for")
                    .setDescription("Which player to vote for.")
                    .setRequired(false)
                    .setAutocomplete(true)),
        text: {
            required: [ z.string(), z.union([ z.literal('add'), z.literal('remove') ]) ],
            optional: [ z.string() ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();
        
        if(global.started == false) throw new Error("Game has not started.");

        const game = await getGameByID(global.game ?? "");
        const gameSetup = await getGameSetup(game, setup);

        const playerInput = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('player');
        if(playerInput == null) throw new Error("Choose a player.");
        const playerUser = await getUserByName(playerInput);
        if(!playerUser) throw new Error("Player not found.");
        const player = global.players.find(player => player.id == playerUser.id);
        if(!player) throw new Error("Player it not in this game");

        const forInput = interaction.type == 'text' ? (interaction.arguments.length > 3 ? interaction.arguments[3] as string : null) : interaction.options.getString('for');
        const forUser = forInput ? await getUserByName(forInput) : undefined;
        const forPlayer = forUser ? global.players.find(player => player.id == forUser.id) : undefined;

        console.log("FOR", forInput, forUser, forPlayer);

        const type = interaction.type == 'text' ? interaction.arguments[2] as string : interaction.options.getString('type');
        if(type == null) throw new Error("Vote type not specified.");
        if(type == "add" && forPlayer == undefined) throw new Error("Player to vote not found.");

        const list = await getUsersArray(global.players.map(player => player.id));
        const fullList = await getAllUsers(game);

        const user = forUser;
        const voter = playerUser;

        let votes = await getVotes({ day: global.day });

        const vote = votes.find(vote => vote.id == voter.id);

        const extensions = await getEnabledExtensions(global);

        const extension = extensions.find(extension => extension.priority.includes("onVote"));

        if(voter && vote && type == "remove") {
            removeVote({ id: voter.id, day: global.day });

            const previous = fullList.find(user => user.id == vote.for);

            let message = voter.nickname + " removed vote for " + (previous?.nickname ?? "<@" + vote.for + ">") + "!";

            const setMessage = await addVoteLog({ message, id: voter.id, day: global.day, for: null, type: "unvote" });

            if(extension == undefined) {
                const messageId = (await setup.primary.chat.send(message)).id;

                await setMessage(messageId);

                if('arguments' in interaction) {
                    await removeReactions(interaction.message);

                    await interaction.message.react("✅");
                } else {
                    await interaction.editReply("Vote counted.");
                }
            } else {
                const result = await extension.onVote(votes, vote, false, global, setup, game) as { hammer: boolean, message: string | null, hammered: string };

                const messageId = (await setup.primary.chat.send(message + (!result.hammer && result.message ? result.message : ""))).id;

                await setMessage(messageId);

                if('arguments' in interaction) {
                    await removeReactions(interaction.message);

                    await interaction.message.react("✅");
                } else {
                    await interaction.editReply("Vote counted.");
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
        } else if(type == "remove") {
            if('arguments' in interaction) {
                await removeReactions(interaction.message);

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
                await setVote({ for: user.id, id: voter.id, day: global.day });
                
                votes.push({ for: user.id, id: voter.id, timestamp: new Date().valueOf() }); //it doesn't really matter the timestamp :/

                voted = true;
            } else {
                await removeVote({ id: voter.id, day: global.day });

                votes = votes.filter(vote => vote.id != voter.id);

                voted = false;

                if(vote.for != user.id) {
                    await setVote({ for: user.id, id: voter.id, day: global.day });
                
                    votes.push({ for: user.id, id: voter.id, timestamp: new Date().valueOf() });

                    voted = true;
                }
            }

            let message = voter.nickname + (voted ? " voted for " : " removed vote for ") + user.nickname + "!";

            const setMessage = await addVoteLog({ message, id: voter.id, day: global.day, type: voted ? "vote" : "unvote", for: voted ? user.id : null });

            if(extension == undefined) {
                let votesForHammer = votes.filter(vote => vote.for == user.id);
                let half = list.length / 2;
                if(half % 1 == 0) half += 0.5;

                const messageId = (await setup.primary.chat.send(message)).id;

                await setMessage(messageId);

                if('arguments' in interaction) {
                    await removeReactions(interaction.message);

                    if(voted) {
                        await interaction.message.react("✅");
                    } else {
                        await interaction.message.react("🗑️");
                    }
                } else {
                    await interaction.editReply("Vote counted.");
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

                const messageId = (await setup.primary.chat.send(message + (!result.hammer && result.message ? result.message : ""))).id;

                await setMessage(messageId);

                if('arguments' in interaction) {
                    await removeReactions(interaction.message);

                    if(voted) {
                        await interaction.message.react("✅");
                    } else {
                        await interaction.message.react("🗑️");
                    }
                } else {
                    await interaction.editReply("Vote counted.");
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
        } 
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