import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { getEnabledExtensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal } from '../../utils/global';
import { getGameByID, getGameSetup } from "../../utils/mafia/games";
import { getUserByName, getUsersArray } from "../../utils/mafia/user";
import { defaultVote, handleHammer, TransactionResult } from "../../utils/mafia/vote";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const VoteCommand = {
    name: "vote",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("vote")
        .setDescription("Change a vote.")
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
    text: () => {
        return new Command()
            .name('vote')
            .description('Add/remove a vote as if the player was voting themselves. Will send a message in main chat notifying players about the vote. History will point to this main chat message.')
            .argument('<voter>', 'which player to vote as')
            .argument('<type>', 'add, remove', fromZod(z.union([z.literal('add'), z.literal('remove')])))
            .argument('[voting]', 'which player to vote');
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
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

        const playerInput = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');
        if(playerInput == null) throw new Error("Choose a player.");
        const playerUser = await getUserByName(playerInput);
        if(!playerUser) throw new Error("Player not found.");
        const player = global.players.find(player => player.id == playerUser.id);
        if(!player) throw new Error("Player it not in this game");

        const forInput = interaction.type == 'text' ? (interaction.program.args.length > 2 ? interaction.program.processedArgs[2] as string : null) : interaction.options.getString('for');
        const forUser = forInput ? await getUserByName(forInput) : undefined;
        const forPlayer = forUser ? global.players.find(player => player.id == forUser.id) : undefined;

        const advType = interaction.type == 'text' ? interaction.program.processedArgs[1] as string : interaction.options.getString('type');
        if(advType == null) throw new Error("Vote type not specified.");
        if(advType == "add" && forPlayer == undefined) throw new Error("Player to vote not found.");

        const extensions = await getEnabledExtensions(global);
        const extension = extensions.find(extension => extension.priority.includes("onVote"));
        
        const type = advType == 'add' ? 'vote' : 'unvote';
        const voter = playerUser;
        const voting = forUser;

        const users = await getUsersArray(game.signups);
        
        const db = firebaseAdmin.getFirestore();
        
        const result = await db.runTransaction(async t => {
            let result: undefined | TransactionResult = undefined;

            if(extension) result = await extension.onVote(global, setup, game, voter, voting, type, users, t) ?? undefined;

            if(result == undefined) result = await defaultVote(global, setup, game, voter, voting, type, users, t);

            return result;
        }) satisfies TransactionResult;

        const message = await setup.primary.chat.send(result.reply.typed);

        if(result.setMessage) await result.setMessage(message.id);

        await handleHammer(result.hammer, global,setup, game);
        
        if(interaction.type == 'text') {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        } else {
            await interaction.editReply("Vote counted.");
        }
    }
} satisfies Subcommand;