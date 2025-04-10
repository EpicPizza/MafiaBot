import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { getGlobal, getGameByID, getAllUsers } from "../utils/main";
import { getSetup } from "../utils/setup";
import { getUser, getUsers, User } from "../utils/user";
import { Vote, getVotes } from "../utils/vote";
import { z } from "zod";
import { Command } from "../discord";
import { getEnabledExtensions } from "../utils/extensions";

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
        },
        {
            type: 'text',
            name: 'text-votes',
            command: {
                optional: [ z.coerce.number().min(1).max(100) ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        return handleVoteList(interaction);
    }
}

async function handleVoteList(interaction: ChatInputCommandInteraction | Command) {
    const global = await getGlobal();

    if(global.started == false) throw new Error("Game has not started.");

    const game = await getGameByID(global.game != null ? global.game : "bruh");

    if(game == null) throw new Error("Game not found.");

    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");
    
    const day = interaction.type == 'text' ? interaction.arguments[0] as number ?? global.day : Math.round(interaction.options.getNumber("day") ?? global.day);

    if(day > global.day) throw new Error("Not on day " + day + " yet!");
    if(day < 1) throw new Error("Must be at least day 1.");

    const users = await getUsers(game.signups);

    let list = await getVotes({ day: day });

    let half = global.players.length / 2;
    if(half % 1 == 0) half += 0.5;
    half = Math.ceil(half);

    const votes = new Map() as Map<string, Vote[]>;

    for(let i = 0; i < list.length; i++) {
        const counted = votes.get(list[i].for);

        if(counted == undefined) {
            votes.set(list[i].for, [list[i]]);
        } else {
            votes.set(list[i].for, [...counted, list[i]].sort((a, b) => a.timestamp - b.timestamp));
        }
    }

    let voting = Array.from(votes.keys());

    voting = voting.sort((a, b) => (votes.get(b)?.length ?? -1) - (votes.get(a)?.length ?? -1));

    const extensions = await getEnabledExtensions(global);

    const extension = extensions.find(extension => extension.priority.includes("onVote"));

    let message = { description: "", footer: "" };

    if(extension == undefined) {
        for(let i = 0; i < voting.length; i++) {
            const voted = votes.get(voting[i]) ?? [];

            message.description += voted.length + " - " + (users.get(voting[i])?.nickname ?? "<@" + voting[i] + ">") + " « " + voted.reduce((previous, current) => previous += (users.get(current.id)?.nickname ?? "<@" + current + ">") + ", ", "");

            console.log(message);

            message.description = message.description.substring(0, message.description.length - 2);

            message.description += "\n";
        }

        if(message.description == "") {
            message.description = "No votes recorded.";
        }

        message.footer = half + " vote" + (half == 1 ? "": "s") + " to hammer";
    } else {
        message = await extension.onVotes(voting, votes, day, users, global, setup, game, interaction);
    }

    const embed = new EmbedBuilder()
        .setTitle("Votes » " + (global.day == day ? "Today (Day " + day + ")" : "Day " + day))
        .setColor(Colors.Gold)
        .setDescription(message.description)
    
    if(global.day == day) {
        embed.setFooter({ text: message.footer });
    }

    const row = new ActionRowBuilder<ButtonBuilder>()
        .setComponents([
            new ButtonBuilder()
                .setLabel("History")
                .setStyle(ButtonStyle.Link)
                .setURL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN as string : process.env.DOMAIN as string) + "/game/" + global.game + "/day/" + day + "/votes")
        ])

    await interaction.reply({ embeds: [embed], components: [row] });
}