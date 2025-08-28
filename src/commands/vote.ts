import { ActionRowBuilder, ApplicationCommandType, ApplicationEmoji, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, EmbedBuilder, GuildEmoji, PermissionsBitField, SlashCommandBuilder, SlashCommandSubcommandBuilder, time } from "discord.js";
import client, { Data, removeReactions } from "../discord";
import { firebaseAdmin } from "../utils/firebase";
import { set, z } from "zod";
import { getGlobal, getGameByName, lockGame, getGameByID, getAllNicknames } from "../utils/main";
import { User, getUser, getUsers, getUsersArray } from "../utils/user";
import { Log, Vote, getVotes, flow, TransactionResult, defaultVote, handleHammer } from "../utils/vote";
import { Setup, getSetup } from "../utils/setup";
import { Command } from "../discord";
import { getEnabledExtensions } from "../utils/extensions";
import { Signups } from "../utils/games";
import { Global } from "../utils/main";
import { Transaction } from "firebase-admin/firestore";
import { capitalize, placeVote, removeVote, retrieveVotes, storeVotes, wipeVotes } from "../utils/fakevotes";

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
        const global = await getGlobal();
        
        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            if(global.started == false) {
                await interaction.respond(
                    [ { name: "Use text command!", value: "Aarav" } ]
                );
            }

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

        if(global.started == false) {
            if(!('arguments' in interaction)) throw new Error("Use text command!");
                
            const votes = await retrieveVotes(interaction.message.channelId);
            

            if(interaction.name == 'unvote' || player == null) {
                removeVote(interaction.user.id, votes);
            } else if(interaction.arguments[0] == "clear") {
                if(!interaction.message.guild) throw new Error("not here?");
                
                const member = await interaction.message.guild.members.fetch({ user: interaction.user.id, cache: true });

                if(!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) throw new Error("Invalid permissions! (Manage Messages)");

                wipeVotes(votes);
            } else {
                placeVote({
                    name: capitalize(interaction.arguments[0] as string),
                    timestamp: new Date().valueOf(),
                    id: interaction.user.id,
                }, votes);
            }
            
            await storeVotes(interaction.message.channelId, votes);

            await interaction.message.react('✅');
            
            return;
        }

        if(global.locked == true) throw new Error("Game is locked!");
        if(global.grace == true) throw new Error("Game is in grace period.");

        if(interaction.type != 'text') await interaction.deferReply();
        
        const setup = await getSetup();
        const game = await getGameByID(global.game ?? "");

        if('arguments' in interaction) {
            if(interaction.message.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        } else {
            if(interaction.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        }

        const users = await getUsersArray(game.signups);

        const author = ('arguments' in interaction) ? interaction.message.author : interaction.user;
        const voter = users.find(user => user.id == author.id);
        const voting = users.find(user => (typeof player == 'string' ? user.nickname.toLowerCase() == player.toLowerCase() || user.id == player || (player.startsWith("<@") && player.length > 4 && player.substring(2, player.length - 1) == user.id) : false));
        
        const extensions = await getEnabledExtensions(global);
        const extension = extensions.find(extension => extension.priority.includes("onVote"));

        const type = (!('arguments' in interaction) ? interaction.commandName == "unvote" : (interaction.name == "unvote" || interaction.arguments.length == 0)) ? "unvote" : "vote";
    
        if(type == 'vote' && voting == undefined) throw new Error("Player not found!");
        if(voter == undefined) throw new Error("You're not in this game?");

        const db = firebaseAdmin.getFirestore();

        const result = await db.runTransaction(async t => {
            let result: undefined | TransactionResult = undefined;

            if(extension) result = await extension.onVote(global, setup, game, voter, voting, type, users, t) ?? undefined;

            if(result == undefined) result = await defaultVote(global, setup, game, voter, voting, type, users, t);

            return result;
        }) satisfies TransactionResult;

        if(interaction.type == 'text') {
            await interaction.message.react(result.reply.emoji);

            if(result.setMessage) await result.setMessage(interaction.message.id);
        } else {
            const message = await interaction.editReply({ content: result.reply.typed });

            if(result.setMessage) await result.setMessage(message.id);
        }

        await handleHammer(result.hammer, global,setup, game);
    }
}

