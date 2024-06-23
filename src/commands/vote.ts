import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { set, z } from "zod";
import { getGlobal, getGameByName, lockGame, getGameByID, getAllCurrentNicknames, getAllUsers } from "../utils/main";
import { User, getUser } from "../utils/user";
import { addVoteLog, getVotes, removeVote, setVote } from "../utils/vote";
import { getSetup } from "../utils/setup";
import { register } from "../register";
import { Command } from "../utils/commands";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-vote',
            command: async () => {
                const defaultCommand = new SlashCommandBuilder()
                    .setName('vote')
                    .setDescription('Vote for a player.')
                    .addStringOption(option =>
                        option  
                            .setName('player')
                            .setDescription('Which player to vote for?')
                            .setRequired(true)
                    )

                const global = await getGlobal();

                console.log(global);
            
                if(global.game == null) return defaultCommand;

                const nicknames = await getAllCurrentNicknames(global);

                console.log(nicknames);

                if(nicknames.length == 0) return defaultCommand;

                return new SlashCommandBuilder()
                    .setName('vote')
                    .setDescription('Vote for a player.')
                    .addStringOption(option =>
                        option  
                            .setName('player')
                            .setDescription('Which player to vote for?')
                            .setRequired(true)
                            .setChoices(nicknames.map(nickname => { return { name: nickname, value: nickname }}))
                    )
            }
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
            command: [ z.string().min(1).max(10) ]
        },
        {
            type: 'text',
            name: 'text-unvote',
            command: []
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction | Command) => {
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
        
        const setup = await getSetup();

        if(typeof setup == 'string') throw new Error("Setup Incomplete");

        const game = await getGameByID(global.game ?? "");

        if('arguments' in interaction) {
            if(interaction.message.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        } else {
            if(interaction.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        }

        console.log("voting", player);

        const list = [] as User[];

        for(let i = 0; i < global.players.length; i++) {
            const user = await getUser(global.players[i].id);

            if(user == null) throw new Error("User not registered.");

            list.push(user);
        }

        const fullList = await getAllUsers(game);

        if(player == "NEEDS REFRESH") {
            await register();

            throw new Error("Command refreshed, wait a min to use again.");
        } else {
            if(!('arguments' in interaction)) await interaction.deferReply();

            const author = ('arguments' in interaction) ? interaction.message.author : interaction.user;

            const user = list.find(user => user.nickname == player || user.id == player);
            const voter = list.find(user => user.id == author.id);

            let votes = await getVotes({ day: global.day });

            const vote = votes.find(vote => vote.id == author.id);

            if(voter && vote && (!('arguments' in interaction) ? interaction.commandName == "unvote" : interaction.name == "unvote" )) {
                removeVote({ id: author.id, day: global.day });

                const previous = fullList.find(user => user.id == vote.for);

                let message = voter.nickname + " removed vote for " + previous?.nickname ?? "<@" + vote.for + ">" + "!";

                await addVoteLog({ message, id: author.id, day: global.day, for: null, type: "unvote" });

                if('arguments' in interaction) {
                    return await interaction.message.react("✅")
                } else {
                    return await interaction.editReply(message);
                }
            } else if((!('arguments' in interaction) ? interaction.commandName == "unvote" : interaction.name == "unvote" )) {
                if('arguments' in interaction) {
                    return await interaction.message.react("❎")
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

                let specific = votes.filter(vote => vote.for == user.id);
                let half = Math.ceil(list.length / 2);

                let message = voter.nickname + (voted ? " voted for " : " removed vote for ") + user.nickname + "!"; //+ (half - specific.length < 4 && half - specific.length > 0 ? " " + (half - specific.length) + " vote" + (half - specific.length == 1 ? "" : "s") + " until hammer!" : "");

                if('arguments' in interaction) {
                    if(voted) {
                        await interaction.message.react("✅")
                    } else {
                        await interaction.message.react("🗑️")
                    }
                } else {
                    await interaction.editReply(message);
                }

                await addVoteLog({ message, id: author.id, day: global.day, type: voted ? "vote" : "unvote", for: voted ? user.id : null });
                
                /*if(half % 2 == 0) half += 0.5;

                if(specific.length >= half) {
                    await lockGame();
                    await setup.primary.chat.send(user.nickname + " has been hammered!");
                }*/
            }   
        }
    } 
}