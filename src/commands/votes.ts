import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { fromZod } from '../utils/text';
import { getBoard, retrieveVotes } from "../utils/mafia/fakevotes";
import { getGameByID, getGameByName } from "../utils/mafia/games";
import { getBoardText, getHammerFooter, historyButton } from "../utils/mafia/voteBoard";
import { getSetup } from "../utils/setup";
import { channelOf, findRunningGame } from "../utils/mafia/context";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-votes',
            command: new SlashCommandBuilder()
                .setName("votes")
                .setDescription("Show votes.")
                .addNumberOption(option =>
                    option
                        .setName('day')
                        .setDescription('game day to show votes from.')
                )
                .addStringOption(option =>
                    option  
                        .setName('game')
                        .setDescription('Name of the game.')
                        .setAutocomplete(true)
                )
        },
        {
            type: 'text',
            name: 'text-votes',
            command: () => {
                return new Command()
                    .name('votes')
                    .description('View current votes or votes from a certain day.')
                    .argument("[day]", "which day to show votes form", fromZod(z.coerce.number().min(1).max(100)))
                    .option('-g, --game <name>', 'which game to show signups from', fromZod(z.string().min(1).max(100)));
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        return handleVoteList(interaction);
    }
}

async function handleVoteList(interaction: Event<ChatInputCommandInteraction | TextCommand>) {
    interaction.inInstance();

    let gameName = interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined ?? null : interaction.options.getString("game");
    
    const running = await findRunningGame(interaction.instance, channelOf(interaction));

    const game = gameName != null ? await getGameByName(gameName ?? "---", interaction.instance, true).catch(() => null) : running?.game ?? null;

    // The viewed game, when it's the one in progress.
    const live = running != undefined && game != null && running.game.id == game.id ? running : undefined;
    
    if(running == undefined && game == null) {
        if(!(interaction.type == 'text')) throw new Error("Use text command!");

        const votes = await retrieveVotes(interaction.message.channelId);

        const board = await getBoard(votes, interaction.instance);

        const embed = new EmbedBuilder()
            .setTitle("Votes")
            .setColor(Colors.Gold)
            .setDescription(board);

        await interaction.reply({ embeds: [embed] });

        return;
    } else if(game == null) {
        throw new Error("Game not found!");
    }
    
    let day = interaction.type == 'text' ? (interaction.program.processedArgs.length > 0 ? interaction.program.processedArgs[0] as number | undefined : undefined) : interaction.options.getNumber("day") ?? undefined;
    
    if(day == undefined && live) {
        day = live.state.day;
    } else if(day == undefined) {
        throw new Error("Day not specified!");
    } else { 
        day = Math.round(day); 
    }

    if(live) {
        if(day > live.state.day) throw new Error("Not on day " + day + " yet!");
    } else {
        if(day > game.days) throw new Error("This game only had " + game.days + " days!");
    }

    if(day < 1) throw new Error("Must be at least day 1.");

    let board = await getBoardText(interaction.instance, game.id, day);
    if(board == "") board = "No votes recorded.";

    const embed = new EmbedBuilder()
        .setTitle("Votes » " + (live && live.state.day == day ? "Today (Day " + day + ")" : "Day " + day))
        .setColor(Colors.Gold)
        .setDescription(board);

    if(live && live.state.day == day) {
        const footer = await getHammerFooter(live, board);

        if(footer) embed.setFooter({ text: footer });
    }

    const row = new ActionRowBuilder<ButtonBuilder>()
        .setComponents([historyButton(interaction.instance, game.id, day)]);

    await interaction.reply({ embeds: [embed], components: [row] });
}