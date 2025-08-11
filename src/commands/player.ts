import { ActionRowBuilder, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Command, Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { User, createUser, editUser, getUser, getUserByName } from "../utils/user";
import { getAllNicknames, getGameByID, getGlobal } from "../utils/main";
import { addSignup, refreshSignup } from "../utils/games";
import { getSetup } from "../utils/setup";

const setNickname = z.object({
    name: z.literal('set-nickname'),
    autoSignUp: z.boolean(),
    game: z.string().optional(),
    for: z.string().optional(),
    type: z.string().optional()
})

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-info',
            command: new SlashCommandBuilder()
                .setName('info')
                .setDescription('Get information about a player.')
                .addStringOption(option =>
                    option 
                        .setName("nickname")
                        .setDescription("Search by nickname.")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addUserOption(option => 
                    option
                        .setName("user")
                        .setRequired(false)
                        .setDescription("Search by user.")
                )
        },
        {
            type: 'slash',
            name: 'slash-nickname',
            command: new SlashCommandBuilder()
                .setName('nickname')
                .setDescription('Edit/Add a nickname.')
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
        }, 
        {
            type: 'text',
            name: 'text-nickname',
            command: {}
        }, 
        {
            type: 'text',
            name: 'text-info',
            command: {
                required: [ z.string().regex(/^<@\d+>$/).or(z.string().regex(/^[a-zA-Z]+$/, "Only letters allowed. No spaces.")) ],
                optional: [ z.literal('extra') ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction | AutocompleteInteraction | Command) => {
        if(interaction.type == 'text' && interaction.name == 'nickname') {
            const embed = new EmbedBuilder()
                .setTitle("Set a nickname.")
                .setDescription("Click to set a nickname.")
                .setColor("Green");
        
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents([
                    new ButtonBuilder() 
                        .setCustomId(JSON.stringify({ name: 'set-nickname', autoSignUp: false, for: interaction.user.id }))
                        .setStyle(ButtonStyle.Success)
                        .setLabel("Set Nickname")
                ]);

            await interaction.reply({
                embeds: [embed],
                components: [row]
            });
        } else if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused();

            const nicknames = await getAllNicknames();

            const filtered = nicknames.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase())).slice(0, 25);;

            await interaction.respond(
                filtered.map(choice => ({ name: choice, value: choice })),
            );

            return;
        } else if(interaction.type != 'text' && interaction.isButton()) {
            const id = JSON.parse(interaction.customId) as z.infer<typeof setNickname>;

            if(id.for && id.for != interaction.user.id) throw new Error("This isn't for you!")

            await showModal(interaction, id.autoSignUp, id.type ?? "text", id.game);
        } else if(interaction.type != 'text' && (interaction.isChatInputCommand() && interaction.commandName == "info") || (interaction.type == 'text' && interaction.name == "info")) {
            const userOption = interaction.type == 'text' ? interaction.arguments[0] as string : interaction.options.getUser("user");
            const nicknameOption = interaction.type == 'text' ? interaction.arguments[0] as string : interaction.options.getString("nickname");

            const extra = interaction.type == 'text' ? interaction.arguments.length > 1 : false;


            let user: User | undefined = undefined;

            if(userOption == null && nicknameOption == null) {
                user = await getUser(interaction.user.id);
            }
            
            if(nicknameOption != null) {
                user = await getUserByName(nicknameOption);
            }
            
            if(userOption != null && user == undefined) {
                user = await getUser(typeof userOption == 'string' ? (userOption.length > 4 ? userOption.substring(2, userOption.length - 1) : userOption) : userOption.id);
            }

            if(user == undefined) return await interaction.reply({ content: "User not found.", ephemeral: true });

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.nickname })
                .setColor(Colors.DarkOrange)
                .setDescription("Nickname: " + user.nickname + "\nUser: <@" + user.id + ">");

            if(extra) {
                const setup = await getSetup();

                const member = await setup.primary.guild.members.fetch({ user: user?.id, cache: true });

                const pfp = (member.avatarURL() ?? member.displayAvatarURL() ?? member.user?.displayAvatarURL() ?? "https://cdn.discordapp.com/avatars/1248187665548054588/cc206768cd2ecf8dfe96c1b047caa60f.webp?size=160");

                const extraEmbed = new EmbedBuilder()
                    .setDescription('Color: ' + member.displayHexColor + "\nURL: " + pfp.substring(0, pfp.length - 5) + ".png");

                await interaction.reply({ embeds: [embed, extraEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } else if(interaction.type != 'text' && interaction.isChatInputCommand() && interaction.commandName == "nickname") {
            await showModal(interaction, false, "command");
        } else if(interaction.type != 'text' && interaction.isModalSubmit()) {
            const global = await getGlobal();

            if(global.started) throw new Error("Nickname cannot be edited durring a game.");

            if(interaction.fields.getTextInputValue('nickname') == "") return await interaction.reply("An error occured, please try again.");

            const requirements = z.string().max(20, "Max length 20 characters.").min(1, "Min length two characters.").regex(/^[a-zA-Z]+$/, "Only letters allowed. No spaces.");

            const nickname = requirements.safeParse(interaction.fields.getTextInputValue('nickname'));

            if(!nickname.success) throw new Error(nickname.error.flatten().formErrors.join(" "));

            const user = await getUser(interaction.user.id);

            const fetch = await getUserByName(interaction.fields.getTextInputValue('nickname'));

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
                    console.log(id, (!('type' in id) || id.type == 'text'));

                    if(interaction.message.deletable && (!('type' in id) || id.type == 'text')) {
                        await interaction.reply({ content: 'You are now signed up!', ephemeral: true });

                        const reference = await interaction.message.fetchReference().catch(() => undefined);

                        if(reference != undefined) {
                            await reference.react("✅")
                        }

                        await interaction.message.delete();
                    } else {
                        await interaction.update({ content: 'You are now signed up!', embeds: [], components: [] });
                    }
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

async function showModal(interaction: ButtonInteraction | ChatInputCommandInteraction,autoSignUp: boolean, type: string, game: string | undefined = undefined) {
    const global = await getGlobal();

    if(global.players.find(player => player.id == interaction.user.id)) throw new Error("Cannot change nickname while you're in a game.");

    const user = await getUser(interaction.user.id);
    
    const modal = new ModalBuilder()
        .setCustomId(JSON.stringify({ name: 'set-nickname', type: type == 'text' ? 'text' : 'command', autoSignUp: autoSignUp, ...(game ? { game: game} : {}) }))
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

function toReadable(number: number) {
    const hours = Math.floor(number / (1000 * 60 * 60));
    const minutes = Math.floor(number / (1000 * 60)) - (hours * 60);
    const seconds = Math.floor(number / 1000) - (minutes * 60) - (hours * 60 * 60);

    if(hours == 0 && minutes == 0) {
        return seconds + " seconds";
    } else if(hours == 0) {
        return minutes + " minutes " + seconds + " seconds";
    } else {
        return hours + " hours " + minutes + " minutes " + seconds + " seconds";
    }
}