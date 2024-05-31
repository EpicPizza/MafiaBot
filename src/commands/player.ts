import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CommandInteraction, EmbedBuilder, ModalBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { getGame } from "../utils";
import { z } from "zod";

const signUpButton = z.object({
    name: z.literal('set-nickname'),
    autoSignUp: z.boolean(),
})

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-player',
            command: new SlashCommandBuilder()
                .setName('player')
                .setDescription('Get information about a player.')
                .addStringOption(option =>
                    option 
                        .setName("nickname")
                        .setRequired(false)
                        .setDescription("Search by nickname.")
                )
                .addMentionableOption(option => 
                    option
                        .setName("user")
                        .setRequired(false)
                        .setDescription("Search by user.")
                )
        },
        {
            type: 'button',
            name: 'button-set-nickname',
            command: signUpButton
        }
    ] satisfies Data[],

    execute: async (interaction: CommandInteraction | ButtonInteraction) => {
        if(interaction.isButton()) {
            const id = JSON.parse(interaction.customId) as z.infer<typeof signUpButton>;

            const modal = new ModalBuilder()
                .setCustomId(JSON.stringify({ name: 'set-nickname', autoSignUp: id.autoSignUp }))
                .setTitle("Set Nickname")

            const nicknameInput = new TextInputBuilder()
                .setCustomId('nickname')
                .setLabel("What nickname do you want for mafia?")
                .setStyle(TextInputStyle.Short);

            const row = new ActionRowBuilder<TextInputBuilder>()
                .addComponents([
                    nicknameInput
                ])

            modal.addComponents([row]);

            await interaction.showModal(modal);
        }
    }
}
