import { SlashCommandBuilder, ChatInputCommandInteraction, Colors, EmbedBuilder, AutocompleteInteraction } from "discord.js";
import { Data } from "../discord";
import { getGameByName, getGlobal } from "../utils/main";
import { getUser, getUsers, getUsersArray } from "../utils/user";
import { getGames } from "../utils/games";
import { z } from "zod";
import { Command } from "../discord";
import { firebaseAdmin } from "../firebase";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-players',
            command: new SlashCommandBuilder()
                .setName("players")
                .setDescription("Show players.")
                .addStringOption(option =>
                    option  
                        .setName('game')
                        .setDescription('Name of the game.')
                        .setAutocomplete(true)
                )
                .addBooleanOption(option => 
                    option
                        .setName('complete')
                        .setDescription('Shows each account connected to each player.')
                )
                .addIntegerOption(option =>
                    option 
                        .setName('day')
                        .setDescription('From which day to show players of.')
                )
        }, 
        {
            type: 'text',
            name: 'text-players',
            command: {
                optional: [
                    z.union([z.string().min(1).max(100), z.number()]).or(z.literal('complete')),
                    z.literal('complete')
                ]
            }
        },
        {
            type: 'text',
            name: 'text-signups',
            command: {
                optional: [
                    z.string().min(1).max(100).or(z.literal('complete')),
                    z.literal('complete')
                ]
            }
        },
        {
            type: 'text',
            name: 'text-pl',
            command: {
                optional: [
                    z.union([z.coerce.number().min(1).max(100), z.string().min(1).max(100)]).or(z.literal('complete')),
                    z.literal('complete')
                ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | AutocompleteInteraction | Command) => {
        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused();

            const games = await getGames();

            const filtered = games.filter(choice => choice.name.startsWith(focusedValue)).slice(0, 25);;

            await interaction.respond(
                filtered.map(choice => ({ name: choice.name, value: choice.name })),
            );

            return;
        } 

        return handlePlayerList(interaction);
    }
}

async function handlePlayerList(interaction: ChatInputCommandInteraction | Command) {
    const global = await getGlobal();

    const complete = interaction.type == 'text' ? interaction.arguments[1] == "complete" || interaction.arguments[0] == "complete" : interaction.options.getBoolean('complete') ?? false;

    let users = [] as { nickname: string, id: string }[];

    const reference = interaction.type == 'text' ? interaction.arguments[0] == "complete" ? null : interaction.arguments[0] as string | number | null ?? null : interaction.options.getString("game");
    const day = interaction.type == 'text' ? (typeof reference == "number" ? reference : null) : interaction.options.getInteger("day");

    console.log(typeof reference);

    if(typeof reference == 'string') {
        const game = await getGameByName(reference);

        if(game == null) throw new Error("Game not found.");

        users = await getUsersArray(game.signups);  
    } else if(day != null) {
        if(global.started == false) throw new Error("Game has not started.");

        const db = firebaseAdmin.getFirestore();

        const currentPlayers = (await db.collection('day').doc(day.toString()).get()).data()?.players as string[] | undefined ?? [];

        if(currentPlayers.length == 0) throw new Error("No data available.");

        users = await getUsersArray(currentPlayers);
    } else {
        if(global.started == false) throw new Error("Game has not started.");
        
        users = await getUsersArray(global.players.map(player => player.id));
    }

    const embed = new EmbedBuilder()
        .setTitle(typeof reference == 'string' || day == null ? "Players - " + users.length : "Players » Day " + day ) 
        .setColor(Colors.Purple)
        .setDescription(users.length == 0 ? "No Players" : complete ? 
            users.reduce((previous, current) => previous += current.nickname +  " - <@"  + current.id + "> \n", "") :
            users.reduce((previous, current) => previous += current.nickname +  "\n", "")
        )
        .setFooter({ text: reference == null || reference == "" || typeof reference == 'number' ? "Showing " + users.length + " game player" + (users.length == 1 ? "" : "s") + "." : "Showing signups for " + reference + "." });

    await interaction.reply({ embeds: [embed] });
}