import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { getGame } from "../utils";
import { z } from "zod";

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
                        .setName("signups")
                        .setDescription("Creates sign up button for a new game."))
        },
        {
            type: 'button',
            name: 'button-sign-up',
            command: z.object({
                name: z.literal('sign-up'),
            })
        }
    ] satisfies Data[],

    execute: async (interaction: CommandInteraction | ButtonInteraction) => {
        if(!interaction.isButton()) {
            return await createSignups(interaction);
        } else {
            return await handleSignup(interaction);
        }
    }
   
}

async function handleSignup(interaction: ButtonInteraction) {
    const embed = new EmbedBuilder()
        .setTitle("Looks like you are a new player!")
        .setDescription("Add a nickname to get started.")
        .setColor("Green");
    
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents([
            new ButtonBuilder() 
                .setCustomId(JSON.stringify({ name: 'set-nickname', autoSignUp: true }))
                .setStyle(ButtonStyle.Success)
                .setLabel("Add Nickname")
        ]);

    await interaction.reply({
        ephemeral: true,
        embeds: [embed],
        components: [row]
    })
}

async function createSignups(interaction: CommandInteraction) {
    const game = await getGame();

    if(game.started) {
        return await interaction.reply({
            content: "You cannot create signups for a game thats already started.",
            ephemeral: true,
        })
    }
    
    const embed = new EmbedBuilder()
        .setTitle("Sign up for Mafia!")
        .setColor("Red")
        .setDescription("No sign ups.")

    return await interaction.reply({
        components: [ new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                [
                    new ButtonBuilder()
                        .setCustomId(JSON.stringify({ name: "sign-up" }))
                        .setLabel("Sign Up")
                        .setStyle(ButtonStyle.Danger)
                ]
            )],
        embeds: [embed],
    })
}
