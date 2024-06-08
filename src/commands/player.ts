import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { User, createUser, editUser, getUser, getUserByName } from "../utils/user";
import { addSignup, getGame, refreshSignup } from "../utils/game";

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

            await showModal(interaction, id.autoSignUp, id.game);
        } else if(interaction.isChatInputCommand() && interaction.options.getSubcommand() == "info") {
            const userOption = interaction.options.getUser("user");
            const nicknameOption = interaction.options.getString("nickname");

            let user: User | undefined = undefined;

            if(userOption == null && nicknameOption == null) {
                user = await getUser(interaction.user.id);
            } else if(nicknameOption != null && nicknameOption.length > 2) {
                user = await getUserByName(nicknameOption.substring(0, 1).toUpperCase() + nicknameOption.substring(1, nicknameOption.length).toLowerCase());
            } else if(userOption != null) {
                user = await getUser(userOption.id);
            } else {
                return await interaction.reply({ content: "Nickname too short." });
            }

            if(user == undefined) return await interaction.reply({ content: "User has not registered.", ephemeral: true });

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.nickname })
                .setColor(Colors.DarkOrange)
                .setDescription("Nickname: " + user.nickname + "\nUser: <@" + user.id + ">");

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else if(interaction.isChatInputCommand() && interaction.options.getSubcommand() == "nickname") {
            await showModal(interaction, false);
        } else if(interaction.isChatInputCommand() && interaction.options.getSubcommand() == "emoji") {
            const type = z.string().emoji().length(2).or(z.string().endsWith(">").startsWith("<").max(64))

            const emoji = type.parse(interaction.options.getString("emoji")?.trim() ?? "");

            await editUser(interaction.user.id, { emoji });

            await interaction.reply({ ephemeral: true, content: "Emoji set." })
        } else if(interaction.isModalSubmit()) {
            const game = await getGame();

            if(game.started) throw new Error("Nickname cannot be edited durring a game.");

            if(interaction.fields.getTextInputValue('nickname') == "") return await interaction.reply("An error occured, please try again.");

            const requirements = z.string().max(20, "Max length 20 characters.").min(1, "Min length two characters.").regex(/^[a-zA-Z]+$/, "Only letters allowed. No spaces.");

            const nickname = requirements.safeParse(interaction.fields.getTextInputValue('nickname'));

            if(!nickname.success) throw new Error(nickname.error.flatten().formErrors.join(" "));

            const user = await getUser(interaction.user.id);

            const fetch = (await getUserByName(interaction.fields.getTextInputValue('nickname').substring(0, 1).toUpperCase() + interaction.fields.getTextInputValue('nickname').substring(1, interaction.fields.getTextInputValue('nickname').length).toLowerCase()));

            if(fetch != undefined && fetch.id != interaction.user.id) throw new Error("Duplicate names not allowed.");

            if(user) {
                await editUser(interaction.user.id, { nickname: interaction.fields.getTextInputValue('nickname').substring(0, 1).toUpperCase() + interaction.fields.getTextInputValue('nickname').substring(1, interaction.fields.getTextInputValue('nickname').length).toLowerCase() });
            } else {
                await createUser(interaction.user.id, interaction.fields.getTextInputValue('nickname').substring(0, 1).toUpperCase() + interaction.fields.getTextInputValue('nickname').substring(1, interaction.fields.getTextInputValue('nickname').length).toLowerCase());
            }

            const id = JSON.parse(interaction.customId) as z.infer<typeof setNickname>;

            console.log(id);

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
                    await interaction.update({ content: 'Your nickname has been set to **' +  interaction.fields.getTextInputValue('nickname').substring(0, 1).toUpperCase() + interaction.fields.getTextInputValue('nickname').substring(1, interaction.fields.getTextInputValue('nickname').length).toLowerCase() + "**.", embeds: [], components: [] });
                } else {
                    await interaction.reply({ content:  'Your nickname has been set to **' +  interaction.fields.getTextInputValue('nickname').substring(0, 1).toUpperCase() + interaction.fields.getTextInputValue('nickname').substring(1, interaction.fields.getTextInputValue('nickname').length).toLowerCase() + "**.", ephemeral: true });
                }
            }
        }
    }
}

async function showModal(interaction: ButtonInteraction | ChatInputCommandInteraction,autoSignUp: boolean, game: string | undefined = undefined) {
    const current = await getGame();

    if(current.started) throw new Error("Cannot change nickname while game is underway.");

    const user = await getUser(interaction.user.id);
    
    const modal = new ModalBuilder()
        .setCustomId(JSON.stringify({ name: 'set-nickname', autoSignUp: autoSignUp, ...(game ? { game: game} : {}) }))
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