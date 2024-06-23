import { SlashCommandBuilder, ChatInputCommandInteraction, Colors, EmbedBuilder } from "discord.js";
import { Data } from "../discord";
import { getGameByName, getGlobal } from "../utils/main";
import { getUser } from "../utils/user";
import { getGames } from "../utils/games";
import { z } from "zod";
import { Command } from "../utils/commands";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-players',
            command: async () => {
                const games = await getGames();

                if(games.length == 0) {
                    return new SlashCommandBuilder()
                        .setName("players")
                        .setDescription("Show players.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                        )
                        .addBooleanOption(option => 
                            option
                                .setName('complete')
                                .setDescription('Shows each account connected to each player.')
                        )
                }

                return new SlashCommandBuilder()
                    .setName("players")
                    .setDescription("Show players.")
                    .addStringOption(option =>
                        option  
                            .setName('game')
                            .setDescription('Name of the game.')
                            .addChoices(games.map(game => { return { name: game.name, value: game.name }}))
                    )
                    .addBooleanOption(option => 
                        option
                            .setName('complete')
                            .setDescription('Shows each account connected to each player.')
                    )
            }
        }, 
        {
            type: 'text',
            name: 'text-players',
            command: {
                optional: [
                    z.string().min(1).max(100).or(z.literal('complete')),
                    z.literal('complete')
                ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        return handlePlayerList(interaction);
    }
}

async function handlePlayerList(interaction: ChatInputCommandInteraction | Command) {

    const complete = interaction.type == 'text' ? interaction.arguments[1] == "complete" || interaction.arguments[0] == "complete" : interaction.options.getBoolean('complete') ?? false;

    const users = [] as { nickname: string, id: string }[];

    const reference = interaction.type == 'text' ? interaction.arguments[0] == "complete" ? null : interaction.arguments[0] as string | null ?? null : interaction.options.getString("game");

    if(reference == null || reference == "") {
        const game = await getGlobal();

        if(game.started == false) throw new Error("Game has not started.");

        for(let i = 0; i < game.players.length; i++) {
            const user = await getUser(game.players[i].id);
    
            if(user == null) throw new Error("User not registered.");
    
            users.push({ id: user.id, nickname: user.nickname });
        }    
    } else {
        const game = await getGameByName(reference);

        if(game == null) throw new Error("Game not found.");

        for(let i = 0; i < game.signups.length; i++) {
            const user = await getUser(game.signups[i]);
    
            if(user == null) throw new Error("User not registered.");
    
            users.push({ id: user.id, nickname: user.nickname });
        }    
    }

    const embed = new EmbedBuilder()
        .setTitle("Players - " + users.length)
        .setColor(Colors.Purple)
        .setDescription(users.length == 0 ? "No Players" : complete ? 
            users.reduce((previous, current) => previous += current.nickname +  " - <@"  + current.id + "> \n", "") :
            users.reduce((previous, current) => previous += current.nickname +  "\n", "")
        )
        .setFooter({ text: reference == null || reference == "" ? "Showing current game players." : "Showing signups for " + reference + "." });

    await interaction.reply({ embeds: [embed] });
}