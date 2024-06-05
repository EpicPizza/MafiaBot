import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, Interaction, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { createUser, editUser, getUser } from "../utils/user";
import { activateSignup, archiveGame, closeSignups, createGame, endGame, getGame, getGameByName, lockGame, openSignups, refreshSignup, startGame, unlockGame } from "../utils/game";
import { DateTime, Zone } from 'luxon';
import { parse, setFutureLock } from "../utils/timing";
import { getSetup } from "../utils/setup";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-mod',
            command: new SlashCommandBuilder()
                .setName('mod')
                .setDescription('Mod only commands.')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('open')
                        .setDescription('Open signups.')
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("close")
                        .setDescription("Close signups.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("signups")
                        .setDescription("Creates sign up button for a new game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("archive")
                        .setDescription("Archives a game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("start")
                        .setDescription("Starts the mafia game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("end")
                        .setDescription("Ends the mafia game.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("lock")
                        .setDescription("Locks the mafia game.")
                        .addBooleanOption(option =>
                            option
                                .setName("day")
                                .setDescription("End the day?")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("unlock")
                        .setDescription("Unlocks the mafia game.")
                        .addStringOption(option =>
                            option
                                .setName("unlock")
                                .setRequired(true)
                                .setDescription("When to unlock channel, just enter \"now\" to unlock immediately.")
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('create')
                        .setDescription("Creates a mafia game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                
        },
        {
            type: 'button',
            name: 'button-reactivate',
            command: z.object({
                name: z.literal('reactivate'),
            })
        }
    ] satisfies Data[],

    execute: async (interaction: Interaction) => {
        if(interaction.isChatInputCommand()) {
            const subcommand = interaction.options.getSubcommand();
            const name = interaction.options.getString("game");

            if(subcommand == "open") {
                if(name == null) throw new Error("Game needs to be specified.");

                await openSignups(name);

                await refreshSignup(name);

                if(!interaction.replied) {
                    await interaction.reply({ ephemeral: true, content: "Sign ups opened!" });   
                }
            } else if(subcommand == "create") {
                if(name == null) throw new Error("Game needs to be specified.");

                await createGame(interaction);
            } else if(subcommand == "archive") {
                if(name == null) throw new Error("Game needs to be specified.");

                await archiveGame(interaction, name);
            } else if(subcommand == "close") {
                if(name == null) throw new Error("Game needs to be specified.");

                await closeSignups(name);

                await refreshSignup(name);

                if(!interaction.replied) {
                    await interaction.reply({ ephemeral: true, content: "Sign ups closed!" });   
                }
            } else if(subcommand == "signups") {
                if(name == null) throw new Error("Game needs to be specified.");

                await openSignups(name);

                return await createSignups(interaction, name);
            } else if(subcommand == "start") {
                if(name == null) throw new Error("Game needs to be specified.");

                await startGame(interaction, name, true);

                //await refreshSignup(name);
            } else if(subcommand == "end") {
                await endGame(interaction);

                //await refreshSignup(name);
            } else if(subcommand == "unlock") {
                await unlockGame();
            } else if(subcommand == "lock") {
                const endDay = interaction.options.getBoolean("day");

                await lockGame();
            }
        } else if(interaction.isButton()) {
            const name = JSON.parse(interaction.customId).name;
            const game = JSON.parse(interaction.customId).game;

            if(name == "reactivate") {
                return await createSignups(interaction, game);
            }
        }
    }
}

async function createSignups(interaction: CommandInteraction | ButtonInteraction, name: string) {
    const main = await getGame();
    const game = await getGameByName(name);
    const setup = await getSetup();

    if(main == null || game == null) throw new Error("Could not find game.");
    if(typeof setup == 'string') throw new Error("Setup incomplete.");

    if(setup.primary.chat.id != interaction.channelId) throw new Error("Cannot create signups in this channel.");

    if(main.started) {
        return await interaction.reply({
            content: "You cannot create signups for a game thats already started.",
            ephemeral: true,
        })
    }
    
    const embed = new EmbedBuilder()
        .setTitle("Sign ups for " + game.name + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription("Loading sign ups...");

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            [
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "sign-up", game: game.name }))
                    .setLabel("Sign Up")
                    .setStyle(game.closed ? ButtonStyle.Danger : ButtonStyle.Primary)
                    .setDisabled(game.closed)
            ]
        )

    const message = (interaction.isButton() ? await interaction.update({
        components: [row],
        embeds: [embed],
        fetchReply: true,
    }) : await interaction.reply({
        components: [row],
        embeds: [embed],
        fetchReply: true,
    }));

    if(message == undefined || message.guildId == undefined) return;

    await activateSignup({ id: message.id, name: game.name });
}