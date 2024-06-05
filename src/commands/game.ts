import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { activateSignup, addSignup, getGame, getGameByID, getGameByName, getGameSetup, refreshSignup, removeSignup } from "../utils/game";
import { User, getUser } from "../utils/user";
import { getSetup } from "../utils/setup";
import { getVotes } from "../utils/vote";

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
                        .setName('votes')
                        .setDescription('Show votes.')
                        .addNumberOption(option =>
                            option
                                .setName('day')
                                .setDescription('Which day to show votes from.')
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('players')
                        .setDescription('Show players.')
                        .addBooleanOption(option => 
                            option
                                .setName('complete')
                                .setDescription('Shows each account connected to each player.')
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('stats')
                        .setDescription('Show stats.')
                        .addNumberOption(option =>
                            option
                                .setName('day')
                                .setDescription('Which day to show votes from.')
                        )
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

            if(subcommand == "votes") return handleVoteList(interaction);

            if(subcommand == "players") return handlePlayerList(interaction);

            if(subcommand == "stats") return handleStatsList(interaction);

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

async function handlePlayerList(interaction: ChatInputCommandInteraction) {
    const game = await getGame();

    const complete = interaction.options.getBoolean('complete') ?? false;

    if(game.started == false) throw new Error("Game has not started.");

    const users = [] as { nickname: string, id: string }[];

    for(let i = 0; i < game.players.length; i++) {
        const user = await getUser(game.players[i].id);

        if(user == null) throw new Error("User not registered.");

        users.push({ id: user.id, nickname: user.nickname });
    }

    const embed = new EmbedBuilder()
        .setTitle("Players")
        .setColor(Colors.Purple)
        .setDescription(complete ? 
            users.reduce((previous, current) => previous += current.nickname +  " - <@"  + current.id + "> \n", "") :
            users.reduce((previous, current) => previous += current.nickname +  "\n", "")
        )

    await interaction.reply({ embeds: [embed] });
}

async function handleVoteList(interaction: ChatInputCommandInteraction) {
    const game = await getGame();

    if(game.started == false) throw new Error("Game has not started.");

    const which = await getGameByID(game.game != null ? game.game : "bruh");

    if(which == null) throw new Error("Game not found.");

    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");
    

    const day = Math.round(interaction.options.getNumber("day") ?? game.day);

    if(day > game.day) throw new Error("Not on day " + day + " yet!");
    if(day < 1) throw new Error("Must be at least day 1.");

    const users = new Map() as Map<string, User>;

    for(let i = 0; i < which.signups.length; i++) {
        const user = await getUser(which.signups[i]);

        if(user == null) throw new Error("User not registered.");

        users.set(user.id, user);
    }

    let list = await getVotes({ day: day });

    const votes = new Map() as Map<string, string[]>;

    for(let i = 0; i < list.length; i++) {
        const counted = votes.get(list[i].for);

        if(counted == undefined) {
            votes.set(list[i].for, [list[i].id]);
        } else {
            votes.set(list[i].for, [...counted, list[i].id]);
        }
    }

    let message = "";

    const voting = Array.from(votes.keys());

    for(let i = 0; i < voting.length; i++) {
        const voted = votes.get(voting[i]) ?? [];

        message += voted.length + " - " + (users.get(voting[i])?.nickname ?? "<@" + voting[i] + ">") + " « " + voted.reduce((previous, current) => previous += (users.get(current)?.nickname ?? "<@" + current + ">") + ", ", "");

        console.log(message);

        message = message.substring(0, message.length - 2);

        message += "\n";
    }

    const embed = new EmbedBuilder()
        .setTitle("Votes")
        .setColor(Colors.Gold)
        .setDescription(message)
        .setFooter({ text: game.day == day ? "Showing votes for current day." : "Showing votes for day " + day + "." });

    await interaction.reply({ embeds: [embed] });
}

async function handleStatsList(interaction: ChatInputCommandInteraction) {
    const game = await getGame();

    if(game.started == false) throw new Error("Game has not started.");

    const which = await getGameByID(game.game != null ? game.game : "bruh");

    if(which == null) throw new Error("Game not found.");

    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");

    const day = Math.round(interaction.options.getNumber("day") ?? game.day);

    if(day > game.day) throw new Error("Not on day " + day + " yet!");
    if(day < 1) throw new Error("Must be at least day 1.");

    const users = new Map() as Map<string, User>;

    for(let i = 0; i < which.signups.length; i++) {
        const user = await getUser(which.signups[i]);

        if(user == null) throw new Error("User not registered.");

        users.set(user.id, user);
    }

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(day.toString()).collection('players');

    const docs = (await ref.get()).docs;

    let list = [] as { name: string, messages: number, words: number}[];

    for(let i = 0; i < docs.length; i++) {
        const data = docs[i].data();

        const user = users.get(docs[i].id);

        if(data) {
            list.push({
                name: user ? user.nickname : "<@" + docs[i].id + ">",
                messages: data.messages,
                words: data.words
            })
        }
    }

    list = list.filter(stat => stat.words > 0);

    const message = list.reduce((previous, current) => previous += current.name + " » " + current.messages + " message" + (current.messages== 1 ? "" : "s") + " containing " + current.words + " word" + (current.words== 1 ? "" : "s") + "\n", "");

    const embed = new EmbedBuilder()
        .setTitle("Stats")
        .setColor(Colors.Gold)
        .setDescription(message == '' ? "No Stats" : message)
        .setFooter({ text: game.day == day ? "Showing stats for current day." : "Showing votes for day " + day + "." });

    await interaction.reply({ embeds: [embed] });
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