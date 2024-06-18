import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { getGlobal, getGameByID } from "../utils/main";
import { getSetup } from "../utils/setup";
import { getUser, User } from "../utils/user";
import { Vote, getVotes } from "../utils/vote";

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

    const votes = new Map() as Map<string, Vote[]>;

    for(let i = 0; i < list.length; i++) {
        const counted = votes.get(list[i].for);

        if(counted == undefined) {
            votes.set(list[i].for, [list[i]]);
        } else {
            votes.set(list[i].for, [...counted, list[i]]);
        }
    }

    let message = "";

    let voting = Array.from(votes.keys());

    voting = voting.sort((a, b) => (votes.get(b)?.length ?? -1) - (votes.get(a)?.length ?? -1));

    for(let i = 0; i < voting.length; i++) {
        const voted = votes.get(voting[i]) ?? [];

        voted.sort((a, b) => a.timestamp - b.timestamp);

        message += voted.length + " - " + (users.get(voting[i])?.nickname ?? "<@" + voting[i] + ">") + " « " + voted.reduce((previous, current) => previous += (users.get(current.id)?.nickname ?? "<@" + current + ">") + ", ", "");

        console.log(message);

        message = message.substring(0, message.length - 2);

        message += "\n";
    }

    const embed = new EmbedBuilder()
        .setTitle("Votes")
        .setColor(Colors.Gold)
        .setDescription(message == "" ? "No votes recorded." : message)
        .setFooter({ text: game.day == day ? "Showing votes for current day (" + day + ")." : "Showing votes for day " + day + "." });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .setComponents([
            new ButtonBuilder()
                .setLabel("History")
                .setStyle(ButtonStyle.Link)
                .setURL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN as string : process.env.DOMAIN as string) + "/game/" + which.name + "/day/" + game.day + "/votes")
        ])

    await interaction.reply({ embeds: [embed], components: [row] });
}