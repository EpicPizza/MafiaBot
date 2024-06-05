import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { activateSignup, addSignup, getGame, getGameByName, refreshSignup, removeSignup } from "../utils/game";
import { getUser } from "../utils/user";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-game',
            command: new SlashCommandBuilder()
                .setName('game')
                .setDescription('Get information about a game.')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("signup")
                        .setDescription("Sign up for mafia!")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("leave")
                        .setDescription("Leave mafia.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('hint')
                        .setDescription('Get a hint.')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('hint')
                        .setDescription('Get a hint.')
                )
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
            const subcommand = interaction.options.getSubcommand();
            const game = interaction.options.getString("game");

            if(game == null) throw new Error("Game not specified.");

            if(subcommand == "hint") return await interaction.reply("Someone is mafia.");

            return await handleSignup(interaction, game, subcommand == "signup");
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
    const main = await getGame();
    const game = await getGameByName(name);

    if(main == null || game == null) throw new Error("Game not found.");

    if(game.closed) return await interaction.reply({ ephemeral: true, content: "Sign ups are closed." });
    if(main.started) return await interaction.reply({ ephemeral: true, content: "Game has started." });

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
    const main = await getGame();
    const game = await getGameByName(name);

    if(main == null || game == null) throw new Error("Game not found.");

    if(game.closed) return await interaction.reply({ ephemeral: true, content: "Sign ups are closed." });
    if(main.started) return await interaction.reply({ ephemeral: true, content: "Game has started." });

    const user = await getUser(interaction.user.id);

    if(user == undefined) {
        if(action === false) return await interaction.reply({ content: "Uh, why are you leaving a game, you haven't even signed up once.", ephemeral: true });

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

        await interaction.reply({
            ephemeral: true,
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

            await interaction.reply({
                ephemeral: true,
                embeds: [embed],
                components: [row]
            })
        } else if(entered && action === false) {
            await leaveSignup(interaction, game.name);
        } else if(!entered && action === false) {
            await interaction.reply({ content: "You have not signed up.", ephemeral: true })
        } else {
            await addSignup({ id: user.id, game: game.name });

            await interaction.reply({
                ephemeral: true,
                content: "You are now signed up!"
            });

            await refreshSignup(game.name);
        }
    }
}
