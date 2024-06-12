import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { set, z } from "zod";
import { activateSignup, addSignup, getGlobal, getGameByName, lockGame, refreshSignup, removeSignup } from "../utils/game";
import { User, getUser } from "../utils/user";
import { getVotes, refreshCommands, removeVote, setVote } from "../utils/vote";
import { getSetup } from "../utils/setup";

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
                        .setChoices({ value: "NEEDS REFRESH", name: "NEEDS REFRESH" })
                )
        },
        {
            type: 'context',
            name: 'context-Vote',
            command: new ContextMenuCommandBuilder()
                .setName('Vote')
                .setType(ApplicationCommandType.User)
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction) => {
        const global = await getGlobal();

        if(global.started == false) throw new Error("Game has not started.");
        
        const setup = await getSetup();

        if(typeof setup == 'string') throw new Error("Setup Incomplete");

        if(interaction.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");

        const player = (() => {
            if(interaction.isChatInputCommand()) {
                return interaction.options.getString('player');
            } else {
                return interaction.targetId;
            }
        })();

        if(player == null) throw new Error("Choose a player.");

        const list = [] as User[];

        for(let i = 0; i < global.players.length; i++) {
            const user = await getUser(global.players[i].id);

            if(user == null) throw new Error("User not registered.");

            list.push(user);
        }

        if(player == "NEEDS REFRESH") {
            await refreshCommands(list.map(user => user.nickname));

            await interaction.reply({ ephemeral: true, content: "Command refreshed, wait a min to use again." });
        } else {
            const user = list.find(user => user.nickname == player || user.id == player);
            const voter = list.find(user => user.id == interaction.user.id);

            if(!user || !voter) {
                throw new Error("Player not found.");
            } else {
                const setup = await getSetup();

                if(typeof setup == 'string') throw new Error("Setup Incomplete");

                let votes = await getVotes({ day: global.day });

                const vote = votes.find(vote => vote.id == interaction.user.id);

                let voted = false;

                if(vote == undefined) {
                    setVote({ for: user.id, id: interaction.user.id, day: global.day });
                    
                    votes.push({ for: user.id, id: interaction.user.id });

                    voted = true;
                } else {
                    removeVote({ id: interaction.user.id, day: global.day });

                    votes = votes.filter(vote => vote.id != interaction.user.id);

                    voted = false;

                    if(vote.for != user.id) {
                        setVote({ for: user.id, id: interaction.user.id, day: global.day });
                    
                        votes.push({ for: user.id, id: interaction.user.id });

                        voted = true;
                    }
                }

                let specific = votes.filter(vote => vote.for == user.id);
                let half = Math.ceil(list.length / 2);

                await setup.primary.chat.send(voter.nickname + " " + (voted ? "voted for " : "removed their vote for ") + user.nickname + "!" + (half - specific.length < 4 && half - specific.length > 0 ? " " + (half - specific.length) + " vote" + (half - specific.length == 1 ? "" : "s") + " until hammer!" : ""));

                if(specific.length >= half) {
                    await lockGame();
                    await setup.primary.chat.send(user.nickname + " has been hammered!");
                }
        
                await interaction.reply({ ephemeral: true, content: "Vote counted." });
            }   
        }
    } 
}