import { ActionRowBuilder, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Command, Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { User, createUser, editUser, getUser, getUserByName } from "../utils/user";
import { getAllCurrentNicknames, getAllNicknames, getGameByID, getGlobal } from "../utils/main";
import { addSignup, refreshSignup } from "../utils/games";

const setNickname = z.object({
    name: z.literal('set-nickname'),
    autoSignUp: z.boolean(),
    game: z.string().optional(),
    for: z.string().optional(),
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
                optional: [ z.string().regex(/^<@\d+>$/).or(z.string().regex(/^[a-zA-Z]+$/, "Only letters allowed. No spaces.")) ]
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

            await showModal(interaction, id.autoSignUp, id.game);
        } else if(interaction.type != 'text' && (interaction.isChatInputCommand() && interaction.commandName == "info") || (interaction.type == 'text' && interaction.name == "info")) {
            const userOption = interaction.type == 'text' ? interaction.arguments[0] as string : interaction.options.getUser("user");
            const nicknameOption = interaction.type == 'text' ? interaction.arguments[0] as string : interaction.options.getString("nickname");

            let user: User | undefined = undefined;

            if(userOption == null && nicknameOption == null) {
                user = await getUser(interaction.user.id);
            }
            
            if(nicknameOption != null) {
                user = await getUserByName(nicknameOption.substring(0, 1).toUpperCase() + nicknameOption.substring(1, nicknameOption.length).toLowerCase());
            }
            
            if(userOption != null && user == undefined) {
                user = await getUser(typeof userOption == 'string' ? (userOption.length > 4 ? userOption.substring(2, userOption.length - 1) : userOption) : userOption.id);
            }

            if(user == undefined) return await interaction.reply({ content: "User not found.", ephemeral: true });

            const global = await getGlobal();

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.nickname })
                .setColor(Colors.DarkOrange)
                

            if(!global.started) {
                embed.setDescription("Nickname: " + user.nickname + "\nUser: <@" + user.id + ">");

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const db = firebaseAdmin.getFirestore();

                const ref = db.collection('day').doc(global.day.toString()).collection('players').doc(user.id);

                const doc = await ref.get();

                const data = doc.data();

                if(data == undefined || data.logs == undefined || data.logs.length < 10) {
                    embed.setDescription("Nickname: " + user.nickname + "\nUser: <@" + user.id + ">\n\nNo other stats available.");

                    await interaction.reply({ embeds: [embed], ephemeral: true });

                    return;
                }

                const start = 1000 * 60 * 60 * 24 * 31;

                const logs = data.logs as { characters: number, timestamp: number, words: number, attachments: number }[];

                const averageCharactersPerWord = logs.reduce((previous, current) => { return current.characters + previous; }, 0) / data.words;

                const timeBetweenMessages = logs.map((log, index, array) => index == 0 ? 0 : log.timestamp - array[index - 1].timestamp );

                const longestTimeBetweenMessages = timeBetweenMessages.reduce((previous, current) =>  current > previous ? current : previous, 0);
                const averageTimeBetweenMessages = timeBetweenMessages.reduce((previous, current) => previous + current, 0) / timeBetweenMessages.length;


                embed.setDescription(`Nickname: ${user.nickname}\nUser: <@ +${user.id}>\n\nAverage Characters Per Word: ${averageCharactersPerWord.toFixed(2)}\nLongest Time Between Messages: ${longestTimeBetweenMessages.toFixed(2)}\nAverage Time Between Messages: ${averageTimeBetweenMessages.toFixed(2)}\nTotal Attachments to Messages: ${data.attachments}`);

                await interaction.reply({ embeds: [embed], ephemeral: true });

                return;
            }
        } else if(interaction.type != 'text' && interaction.isChatInputCommand() && interaction.commandName == "nickname") {
            await showModal(interaction, false);
        } else if(interaction.type != 'text' && interaction.isModalSubmit()) {
            const global = await getGlobal();

            if(global.started) throw new Error("Nickname cannot be edited durring a game.");

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
                    if(interaction.message.deletable) {
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

async function showModal(interaction: ButtonInteraction | ChatInputCommandInteraction,autoSignUp: boolean, game: string | undefined = undefined) {
    const global = await getGlobal();

    if(global.started) throw new Error("Cannot change nickname while game is underway.");

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