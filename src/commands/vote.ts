import { ActionRowBuilder, ApplicationCommandType, ApplicationEmoji, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, EmbedBuilder, GuildEmoji, SlashCommandBuilder, SlashCommandSubcommandBuilder, time } from "discord.js";
import client, { Data, removeReactions } from "../discord";
import { firebaseAdmin } from "../firebase";
import { set, z } from "zod";
import { getGlobal, getGameByName, lockGame, getGameByID, getAllNicknames } from "../utils/main";
import { User, getUser, getUsers, getUsersArray } from "../utils/user";
import { Log, Vote, getVotes, flow, TransactionResult, defaultVote } from "../utils/vote";
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

        if(interaction.type != 'text') await interaction.deferReply();
        
        const setup = await getSetup();
        const game = await getGameByID(global.game ?? "");

        if('arguments' in interaction) {
            if(interaction.message.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        } else {
            if(interaction.channelId != setup.primary.chat.id) throw new Error("Must vote in main chat.");
        }

        const users = await getUsersArray(global.players.map(player => player.id));

        const author = ('arguments' in interaction) ? interaction.message.author : interaction.user;
        const voter = users.find(user => user.id == author.id);
        const voting = users.find(user => (typeof player == 'string' ? user.nickname.toLowerCase() == player.toLowerCase() || user.id == player || (player.startsWith("<@") && player.length > 4 && player.substring(2, player.length - 1) == user.id) : false));
        
        const extensions = await getEnabledExtensions(global);
        const extension = extensions.find(extension => extension.priority.includes("onVote"));

        const type = (!('arguments' in interaction) ? interaction.commandName == "unvote" : (interaction.name == "unvote" || interaction.arguments.length == 0)) ? "unvote" : "vote";
    
        if(type == 'vote' && voting == undefined) throw new Error("Player not found!");
        if(voter == undefined) throw new Error("Must specify voter?");

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

        if(result.hammer?.hammered) {
            await lockGame();
            await hammerExtensions(global, setup, game, result.hammer.id);

            await new Promise(resolve => {
                setTimeout(() => {
                    resolve(null);
                }, 2000);
            });

            await setup.primary.chat.send(result.hammer.message);
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

