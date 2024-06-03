import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, Interaction, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { createUser, editUser, getUser } from "../utils/user";
import { activateSignup, addPlayer, closeSignups, endGame, getGame, openSignups, refreshSignup, startGame } from "../utils/game";
const parseHumanRelativeTime = require('parse-human-relative-time')();

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
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("close")
                        .setDescription("Close signups.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("signups")
                        .setDescription("Creates sign up button for a new game.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("start")
                        .setDescription("Starts the mafia game.")
                        .addStringOption(option =>
                            option
                                .setName("unlock")
                                .setRequired(true)
                                .setDescription("When to unlock channel, just enter \"now\" to unlock immediately.")

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
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("unlock")
                        .setDescription("Unlocks the mafia game.")
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

            if(subcommand == "open") {
                await openSignups(interaction);

                await refreshSignup();

                if(!interaction.replied) {
                    await interaction.reply({ ephemeral: true, content: "Sign ups OPENED!" });   
                }
            } else if(subcommand == "close") {
                await closeSignups(interaction);

                await refreshSignup();

                if(!interaction.replied) {
                    await interaction.reply({ ephemeral: true, content: "Sign ups closed!" });   
                }
            } else if(subcommand == "signups") {
                await openSignups(interaction);

                return await createSignups(interaction);
            } else if(subcommand == "start") {
                const when = interaction.options.getString("unlock");

                if(when == undefined || when == "now") {
                    console.log("unlocking");
                } else {
                    console.log(parseHumanRelativeTime(when).toString())
                }

                await startGame(interaction);

                await refreshSignup();
            } else if(subcommand == "end") {
                await endGame(interaction);

                await refreshSignup();
            }
        } else if(interaction.isButton()) {
            const name = JSON.parse(interaction.customId).name;

            if(name == "reactivate") {
                return await createSignups(interaction);
            }
        }
    }
}

async function createSignups(interaction: CommandInteraction | ButtonInteraction) {
    const game = await getGame();

    if(game.started) {
        return await interaction.reply({
            content: "You cannot create signups for a game thats already started.",
            ephemeral: true,
        })
    }
    
    const embed = new EmbedBuilder()
        .setTitle("Sign ups for Mafia" + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription("Loading sign ups...");

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            [
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "sign-up" }))
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

    if(message == undefined ||message.guildId == undefined) return;

    await activateSignup({ id: message.id, channel: message.channel.id, guild: message.guildId })
}