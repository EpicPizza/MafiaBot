import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { createUser, editUser, getUser } from "../utils/user";
import { addSignup, refreshSignup } from "../utils/game";

const setNickname = z.object({
    name: z.literal('set-nickname'),
    autoSignUp: z.boolean(),
    game: z.string().optional(),
})

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-player',
            command: new SlashCommandBuilder()
                .setName('player')
                .setDescription('Everything related to the player.')
                .addSubcommand(subcommand => 
                    subcommand  
                        .setName('info')
                        .setDescription('Get information about a player.')
                        .addStringOption(option =>
                            option 
                                .setName("nickname")
                                .setRequired(false)
                                .setDescription("Search by nickname.")
                        )
                        .addUserOption(option => 
                            option
                                .setName("user")
                                .setRequired(false)
                                .setDescription("Search by user.")
                        )
                )
                .addSubcommand(subcommand => 
                    subcommand
                        .setName('nickname')
                        .setDescription('Edit/Add a nickname.')
                )
                .addSubcommand(subcommand => 
                    subcommand
                        .setName('emoji')
                        .setDescription('Edit/Add a emoji.')
                        .addStringOption(option =>
                            option
                                .setName("emoji")
                                .setDescription("Emoji that appears next to your name.")
                                .setRequired(true)
                        )
                )
        },
        {
            type: 'button',
            name: 'button-set-nickname',
            command: setNickname
        },
        {
            type: 'modal',
            name: 'modal-set-nickname',
            command: setNickname
        }
    ] satisfies Data[],

    execute: async (interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction) => {
        if(interaction.isButton()) {
            const id = JSON.parse(interaction.customId) as z.infer<typeof setNickname>;

            await showModal(interaction, id.autoSignUp);
        } else if(interaction.isChatInputCommand() && interaction.options.getSubcommand() == "info") {
            const user = await getUser(interaction.user.id);

            if(user == undefined) return await interaction.reply({ content: "User has not registered.", ephemeral: true });

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.nickname, iconURL: interaction.user.avatarURL() == null ? interaction.user.defaultAvatarURL : interaction.user.avatarURL() as string })
                .setColor(Colors.DarkOrange)
                .setDescription("Nickname: " + user.nickname + "\nEmoji: " + (user.emoji == false ? "None Set" : user.emoji));

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else if(interaction.isChatInputCommand() && interaction.options.getSubcommand() == "nickname") {
            await showModal(interaction, false);
        } else if(interaction.isChatInputCommand() && interaction.options.getSubcommand() == "emoji") {
            const type = z.string().emoji().length(2).or(z.string().endsWith(">").startsWith("<").max(64))

            const emoji = type.parse(interaction.options.getString("emoji")?.trim() ?? "");

            await editUser(interaction.user.id, { emoji });

            await interaction.reply({ ephemeral: true, content: "Emoji set." })
        } else if(interaction.isModalSubmit()) {
            if(interaction.fields.getTextInputValue('nickname') == "") return await interaction.reply("An error occured, please try again.");

            const user = await getUser(interaction.user.id);

            if(user) {
                await editUser(interaction.user.id, { nickname: interaction.fields.getTextInputValue('nickname') });
            } else {
                await createUser(interaction.user.id, interaction.fields.getTextInputValue('nickname'));
            }

            const id = JSON.parse(interaction.customId) as z.infer<typeof setNickname>;

            if(id.autoSignUp) {
                if(id.game == null) return await interaction.reply({ ephemeral: true, content: "Game not found." });

                await addSignup({ id: interaction.user.id, game: id.game });

                await refreshSignup(id.game);

                if(interaction.isFromMessage()) {
                    await interaction.update({ content: 'You are now signed up!', embeds: [], components: [] });
                } else {
                    await interaction.reply({ content: 'You are now signed up!', ephemeral: true });
                }
            } else {
                if(interaction.isFromMessage()) {
                    await interaction.update({ content: 'Your nickname has been set to **' +  interaction.fields.getTextInputValue('nickname') + "**.", embeds: [], components: [] });
                } else {
                    await interaction.reply({ content:  'Your nickname has been set to **' +  interaction.fields.getTextInputValue('nickname') + "**.", ephemeral: true });
                }
            }
        }
    }
}

async function showModal(interaction: ButtonInteraction | ChatInputCommandInteraction,autoSignUp: boolean) {
    const user = await getUser(interaction.user.id);
    
    const modal = new ModalBuilder()
        .setCustomId(JSON.stringify({ name: 'set-nickname', autoSignUp: autoSignUp }))
        .setTitle("Set Nickname")

    const nicknameInput = new TextInputBuilder()
        .setCustomId('nickname')
        .setLabel("What nickname do you want for mafia?")
        .setStyle(TextInputStyle.Short)
        .setValue(user ? user.nickname : "");

    const row = new ActionRowBuilder<TextInputBuilder>()
        .addComponents([
            nicknameInput
        ])

    modal.addComponents([row]);

    await interaction.showModal(modal);
}