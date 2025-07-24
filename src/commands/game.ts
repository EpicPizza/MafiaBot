import { ActionRowBuilder, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, Data, removeReactions } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { getGlobal, getGameByID, getGameByName } from "../utils/main";
import { User, getUser } from "../utils/user";
import { getSetup } from "../utils/setup";
import { getVotes } from "../utils/vote";
import { addSignup, getGames, refreshSignup, removeSignup } from "../utils/games";
import { FieldValue } from "firebase-admin/firestore";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-signup',
            command: new SlashCommandBuilder()
                .setName("signup")
                .setDescription("Sign up for a mafia game!")
                .addStringOption(option =>
                    option  
                        .setName('game')
                        .setDescription('Name of the game.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        },
        {
            type: 'text',
            name: 'text-signup',
            command: {
                required: [ z.string().min(1).max(100) ],
            }
        },
        { 
            type: 'slash',
            name: 'slash-leave',
            command: new SlashCommandBuilder()
                .setName("leave")
                .setDescription("Leave mafia game.")
                .addStringOption(option =>
                    option  
                        .setName('game')
                        .setDescription('Name of the game.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        },
        {
            type: 'text',
            name: 'text-leave',
            command: {
                required: [ z.string().min(1).max(100) ],
            }
        },
        {
            type: 'button',
            name: 'button-leave',
            command: z.object({
                name: z.literal('leave'),
                game: z.string(),
            })
        },
        {
            type: 'button',
            name: 'button-confirm-signup',
            command: z.object({
                name: z.literal('confirm-signup'),
                game: z.string(),
            })
        }
    ] satisfies Data[],

    execute: async (interaction: CommandInteraction | ButtonInteraction | AutocompleteInteraction | Command) => {
        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused();

            const games = await getGames();

            const filtered = games.filter(choice => choice.name.startsWith(focusedValue)).slice(0, 25);

            await interaction.respond(
                filtered.map(choice => ({ name: choice.name, value: choice.name })),
            );

            return;
        } else if(interaction.type == 'text' || interaction.isChatInputCommand()) {
            const commandName = interaction.type == 'text' ? interaction.name : interaction.commandName;

            const name = interaction.type == 'text' ? interaction.arguments[0] as string : interaction.options.getString('game');

            if(name == null) throw new Error("Game needs to be specified.");

            return await handleSignup(interaction, name, commandName == "signup");
        } else if(interaction.isButton()) {
            const id = JSON.parse(interaction.customId);

            if(id.name == "leave") return await leaveSignup(interaction, id.game);

            const global = await getGlobal();
            const game = await getGameByName(id.game);

            if(global == null || game == null) throw new Error("Game not found.");

            if(game.closed) throw new Error("Sign ups are closed.");
            if(global.started && global.game == game.id) throw new Error("Game has started.");

            const user = await getUser(interaction.user.id);

            if(!user || !game.signups.includes(user.id)) throw new Error("You haven't signed up!");
            if(game.confirmations.includes(user.id)) throw new Error("You've already confirmed!");

            const db = firebaseAdmin.getFirestore();

            await db.collection('settings').doc('game').collection('games').doc(game.id).update({
                confirmations: FieldValue.arrayUnion(user.id)
            });

            await interaction.reply("Thanks for confirming!");
        }
    } 
}

async function leaveSignup(interaction: ButtonInteraction | ChatInputCommandInteraction | Command, name: string) {
    if(interaction.type != 'text') {
        if(!interaction.deferred && interaction.isChatInputCommand()) await interaction.deferReply({ ephemeral: true });
    } else {
        await interaction.message.react("<a:loading:1256150236112621578>");
    }
    
    const global = await getGlobal();
    const game = await getGameByName(name);

    if(global == null || game == null) throw new Error("Game not found.");

    if(game.closed) throw new Error("Sign ups are closed.");
    if(global.started && global.game == game.id) throw new Error("Game has started.");

    const user = await getUser(interaction.user.id);

    if(user) {
        await removeSignup({ id: user.id, game: game.name });
    } else {
        throw new Error("You haven't signed up to anything!");
    }

    if(interaction.type != 'text' && interaction.isButton()) {
        await interaction.update({
            components: [],
            embeds: [],
            content: "You've left the game."
        })
    } else if(interaction.type != 'text') {
        await interaction.editReply({
            content: "You've left the game."
        })
    } else {
        await removeReactions(interaction.message);

        await interaction.message.react("✅");
    }

    await refreshSignup(game.name);
}

async function handleSignup(interaction: ChatInputCommandInteraction | Command, name: string, action: boolean | null = null) {
    if(interaction.type != 'text') {
        await interaction.deferReply({ ephemeral: true });
    } else {
        await interaction.message.react("<a:loading:1256150236112621578>");
    }

    const global = await getGlobal();
    const game = await getGameByName(name);

    if(global == null || game == null) throw new Error("Game not found.");

    if(game.closed) throw new Error("Sign ups are closed.");
    if(global.started && global.game == game.id) throw new Error("Game has started.");

    const user = await getUser(interaction.user.id);

    if(user == undefined) {
        if(action === false) throw new Error("Uh, why are you leaving a game, you haven't even signed up once.");

        const embed = new EmbedBuilder()
            .setTitle("Looks like you are a new player!")
            .setDescription("Add a nickname to get started.")
            .setColor("Green");
    
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder() 
                    .setCustomId(JSON.stringify({ name: 'set-nickname', autoSignUp: true, type: interaction.type == 'text' ? 'text' : 'command', game: game.name }))
                    .setStyle(ButtonStyle.Success)
                    .setLabel("Add Nickname")
            ]);

        if(interaction.type != 'text') {
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            })
        } else {
            await removeReactions(interaction.message);

            await interaction.reply({
                embeds: [embed],
                components: [row]
            })
        }
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

            if(interaction.type != 'text') {
                await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                })
            } else {
                await removeReactions(interaction.message);

                await interaction.message.react("✅");
            }
        } else if(entered && action === false) {
            await leaveSignup(interaction, game.name);
        } else if(!entered && action === false) {
            if(interaction.type != 'text') {
                await interaction.editReply({ content: "You have not signed up." });
            } else {
                await removeReactions(interaction.message);

                await interaction.message.react("✅");
            }
        } else {
            await addSignup({ id: user.id, game: game.name });

            if(interaction.type != 'text') {
                await interaction.editReply({ content: "You are now signed up!" });
            } else {
                await removeReactions(interaction.message);

                await interaction.message.react("✅");
            }

            await refreshSignup(game.name);
        }
    }
}