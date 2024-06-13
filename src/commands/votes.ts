import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { getGlobal, getGameByID } from "../utils/main";
import { getSetup } from "../utils/setup";
import { getUser, User } from "../utils/user";
import { getVotes } from "../utils/vote";

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
                        .setDescription('Which day to show votes from.')
                )
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        return handleVoteList(interaction);
    }
}

async function handleVoteList(interaction: ChatInputCommandInteraction) {
    const game = await getGlobal();

    if(game.started == false) throw new Error("Game has not started.");

    const which = await getGameByID(game.game != null ? game.game : "bruh");

    if(which == null) throw new Error("Game not found.");

    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");
    

    const day = Math.round(interaction.options.getNumber("day") ?? game.day);

    if(day > game.day) throw new Error("Not on day " + day + " yet!");
    if(day < 1) throw new Error("Must be at least day 1.");

    const users = new Map() as Map<string, User>;

    for(let i = 0; i < which.signups.length; i++) {
        const user = await getUser(which.signups[i]);

        if(user == null) throw new Error("User not registered.");

        users.set(user.id, user);
    }

    let list = await getVotes({ day: day });

    const votes = new Map() as Map<string, string[]>;

    for(let i = 0; i < list.length; i++) {
        const counted = votes.get(list[i].for);

        if(counted == undefined) {
            votes.set(list[i].for, [list[i].id]);
        } else {
            votes.set(list[i].for, [...counted, list[i].id]);
        }
    }

    let message = "";

    const voting = Array.from(votes.keys());

    for(let i = 0; i < voting.length; i++) {
        const voted = votes.get(voting[i]) ?? [];

        message += voted.length + " - " + (users.get(voting[i])?.nickname ?? "<@" + voting[i] + ">") + " « " + voted.reduce((previous, current) => previous += (users.get(current)?.nickname ?? "<@" + current + ">") + ", ", "");

        console.log(message);

        message = message.substring(0, message.length - 2);

        message += "\n";
    }

    const embed = new EmbedBuilder()
        .setTitle("Votes")
        .setColor(Colors.Gold)
        .setDescription(message == "" ? "No votes recorded." : message)
        .setFooter({ text: game.day == day ? "Showing votes for current day (" + day + ")." : "Showing votes for day " + day + "." });

    await interaction.reply({ embeds: [embed] });
}