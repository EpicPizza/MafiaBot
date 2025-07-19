import { ChatInputCommandInteraction, SlashCommandStringOption, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByID, getGlobal, lockGame, setupPlayer } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, getUserByName, getUsersArray, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";
import { FieldValue } from "firebase-admin/firestore";
import { defaultVote, flow, getVotes, TransactionResult } from "../../utils/vote";

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

        const advType = interaction.type == 'text' ? interaction.arguments[2] as string : interaction.options.getString('type');
        if(advType == null) throw new Error("Vote type not specified.");
        if(advType == "add" && forPlayer == undefined) throw new Error("Player to vote not found.");

        const extensions = await getEnabledExtensions(global);
        const extension = extensions.find(extension => extension.priority.includes("onVote"));
        
        const type = advType == 'add' ? 'vote' : 'unvote';
        const voter = playerUser;
        const voting = forUser;

        const users = await getUsersArray(global.players.map(player => player.id));
        
        const db = firebaseAdmin.getFirestore();
        
        const result = await db.runTransaction(async t => {
            let result: undefined | TransactionResult = undefined;

            if(extension) result = await extension.onVote(global, setup, game, voter, voting, type, users, t) ?? undefined;

            if(result == undefined) result = await defaultVote(global, setup, game, voter, voting, type, users, t);

            return result;
        }) satisfies TransactionResult;

        const message = await setup.primary.chat.send(result.reply.typed);

        if(result.setMessage) await result.setMessage(message.id);

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

        if('arguments' in interaction) {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        } else {
            await interaction.editReply("Vote counted.");
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