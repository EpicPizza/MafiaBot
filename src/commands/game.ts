import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { getGlobal, getGameByID, getGameByName } from "../utils/main";
import { User, getUser } from "../utils/user";
import { getSetup } from "../utils/setup";
import { getVotes } from "../utils/vote";
import { addSignup, getGames, refreshSignup, removeSignup } from "../utils/games";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-signup',
            command: async () => {
                const games = await getGames();

                if(games.length == 0) {
                    return new SlashCommandBuilder()
                        .setName("signup")
                        .setDescription("Sign up for a mafia game!")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                }

                return new SlashCommandBuilder()
                    .setName("signup")
                    .setDescription("Sign up for a mafia game!")
                    .addStringOption(option =>
                        option  
                            .setName('game')
                            .setDescription('Name of the game.')
                            .setRequired(true)
                            .addChoices(games.map(game => { return { name: game.name, value: game.name }}))
                    )
            } 
        },
        { 
            type: 'slash',
            name: 'slash-leave',
            command: async () => {
                const games = await getGames();

                if(games.length == 0) {
                    return new SlashCommandBuilder()
                        .setName("leave")
                        .setDescription("Leave mafia game.")    
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                }

                return new SlashCommandBuilder()
                    .setName("leave")
                    .setDescription("Leave mafia game.")
                    .addStringOption(option =>
                        option  
                            .setName('game')
                            .setDescription('Name of the game.')
                            .setRequired(true)
                            .addChoices(games.map(game => { return { name: game.name, value: game.name }}))
                    )
            }
        },
        {
            type: 'button',
            name: 'button-sign-up',
            command: z.object({
                name: z.literal('sign-up'),
                game: z.string(),
            })
        },
        {
            type: 'button',
            name: 'button-leave',
            command: z.object({
                name: z.literal('leave'),
                game: z.string(),
            })
        }
    ] satisfies Data[],

    execute: async (interaction: CommandInteraction | ButtonInteraction) => {
        if(interaction.isChatInputCommand()) {
            const commandName = interaction.commandName;

            const game = interaction.options.getString("game");

            if(game == null) throw new Error("Game not specified.");

            return await handleSignup(interaction, game, commandName == "signup");
        } else if(interaction.isButton()) {
            const id = JSON.parse(interaction.customId);

            if(id.name == "sign-up") {
                return await handleSignup(interaction, id.game);
            } else {
                return await leaveSignup(interaction, id.game);
            } 
        }
    } 
}

async function leaveSignup(interaction: ButtonInteraction | ChatInputCommandInteraction, name: string) {
    const global = await getGlobal();
    const game = await getGameByName(name);

    if(global == null || game == null) throw new Error("Game not found.");

    if(game.closed) return await interaction.reply({ ephemeral: true, content: "Sign ups are closed." });
    if(global.started) return await interaction.reply({ ephemeral: true, content: "Game has started." });

    const user = await getUser(interaction.user.id);

    if(user) {
        await removeSignup({ id: user.id, game: game.name });
    }

    if(interaction.isButton()) {
        await interaction.update({
            components: [],
            embeds: [],
            content: "You've left the game."
        })
    } else {
        await interaction.reply({
            ephemeral: true,
            content: "You've left the game."
        })
    }

    await refreshSignup(game.name);
}

async function handleSignup(interaction: ButtonInteraction | ChatInputCommandInteraction, name: string, action: boolean | null = null) {
    await interaction.deferReply({ ephemeral: true });

    const global = await getGlobal();
    const game = await getGameByName(name);

    if(global == null || game == null) throw new Error("Game not found.");

    if(game.closed) return await interaction.editReply({ content: "Sign ups are closed." });
    if(global.started) return await interaction.editReply({ content: "Game has started." });

    const user = await getUser(interaction.user.id);

    if(user == undefined) {
        if(action === false) return await interaction.editReply({ content: "Uh, why are you leaving a game, you haven't even signed up once." });

        const embed = new EmbedBuilder()
        .setTitle("Looks like you are a new player!")
        .setDescription("Add a nickname to get started.")
        .setColor("Green");
    
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder() 
                    .setCustomId(JSON.stringify({ name: 'set-nickname', autoSignUp: true, game: game.name }))
                    .setStyle(ButtonStyle.Success)
                    .setLabel("Add Nickname")
            ]);

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        })
    } else {
        const entered = !(game.signups.find(player => player == user.id) == undefined)

        if(entered && (action === null || action === true)) {
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents([
                    new ButtonBuilder()
                        .setCustomId(JSON.stringify({ name: "leave", game: game.name }))
                        .setStyle(ButtonStyle.Danger)
                        .setLabel("Leave")
                ])

            const embed = new EmbedBuilder()
                .setTitle("You're already signed up!")
                .setDescription("If you've changed your mind, you can leave.")
                .setColor(Colors.Red)

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            })
        } else if(entered && action === false) {
            await leaveSignup(interaction, game.name);
        } else if(!entered && action === false) {
            await interaction.editReply({ content: "You have not signed up." })
        } else {
            await addSignup({ id: user.id, game: game.name });

            await interaction.editReply({
                content: "You are now signed up!"
            });

            await refreshSignup(game.name);
        }
    }
}