import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import client from "../../discord/client";
import { removeReactions } from "../../discord/helpers";
import { firebaseAdmin } from "../../utils/firebase";
import { archiveGame, createGame, getGameByName, getGameSetup } from "../../utils/mafia/games";
import { getUserByName, getUsersArray } from "../../utils/mafia/user";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const CreateCommand = {
    name: "create",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('create')
        .setDescription("Creates a mafia game.")
        .addStringOption(option =>
            option  
                .setName('game')
                .setDescription('Name of the game.')
                .setRequired(true)
        ),
    text: () => {
        return new Command()
            .name('create')
            .description('Creates a new game. Also makes spectator and mafia channels for that game.')
            .argument('<name>', 'name of game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await createGame(interaction, name, interaction.instance);
    }
} satisfies Subcommand;

export const ArchiveCommand = {
    name: "archive",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("archive")
        .setDescription("Archives a game.")
        .addStringOption(option =>
            option  
                .setName('game')
                .setDescription('Removes the game from database and moves channels to archived category.')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('archive')
            .description('archives a game')
            .argument('<name>', 'name of game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await archiveGame(interaction, name, interaction.instance);
    }
} satisfies Subcommand;

export const ResendConfirmationsCommand = {
    name: "resend",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("resend")
        .setDescription("Resends confirmations of all players or one in a game.")
        .addStringOption(option =>
            option  
                .setName('game')
                .setDescription('Name of the game.')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option  
                .setName('player')
                .setDescription('Name of the player.')
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('resend')
            .description('resends confirmations of all players or one')
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)))
            .option('-p, --player <name>', 'nickname of specific player', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
        
        const gameName = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');
        const playerName = interaction.type == 'text' ? interaction.program.getOptionValue("player") as string | undefined : interaction.options.getString('player') ?? undefined;

        if(gameName == null) throw new Error("Game needs to be specified.");

        const setup = interaction.instance.setup;
        const game = await getGameByName(gameName, interaction.instance);
        const gameSetup = await getGameSetup(game, setup);

        const player = playerName ? await getUserByName(playerName, interaction.instance) : undefined;
        if(player == undefined && playerName != undefined) throw new Error("Player not found!");
        const players = player ? [ player ] : await getUsersArray(game.signups, interaction.instance);

        console.log(players);

        await Promise.allSettled(players.map(async player => {
            const dm = await (await client.users.fetch(player.id)).createDM();

            if(!dm) return await gameSetup.spec.send("Unable to send dms to <@" + player.id + ">.");

            const db = firebaseAdmin.getFirestore();

            const domain = (process.env.DEV == 'TRUE' ? process.env.DEVDOMAIN : process.env.DOMAIN);
            let message = "";

            const query = db.collection('documents').where('integration', '==', 'Welcome');
            const docs = (await query.get()).docs;
            if(docs.length < 1) message = domain  + "/docs/welcome-message/";
            if(docs.length > 0) message = (docs[0].data().content as string).replaceAll("](/", "](" + domain + "/");

            const embed = new EmbedBuilder()
                .setTitle('Welcome!')
                .setDescription(message)
                .setColor(Colors.Yellow)

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(JSON.stringify({ name: "confirm-signup", game: game.name }))
                        .setStyle(ButtonStyle.Primary)
                        .setLabel('Confirm')
                )

            dm.send({ components: [row], embeds: [embed] });
        }));

        if(interaction.type == 'text') {
            await removeReactions(interaction.message);
            await interaction.message.react("✅");
        } else {
            await interaction.editReply({ content: "Confirmation resent." })
        }
    }
} satisfies Subcommand;

export const ConfirmationsCommand = {
    name: "confirmations",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("confirmations")
        .setDescription("Shows confirmations of all players in a game.")
        .addStringOption(option =>
            option  
                .setName('game')
                .setDescription('Name of the game.')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('confirmations')
            .description('Shows confirmations of all players in a game. Must have all player confirmations to start game.')
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        const game = await getGameByName(name, interaction.instance);
        const users = await getUsersArray(game.signups, interaction.instance);

        const confirmations = users.map(user => ({ name: user.nickname, confirmed: game.confirmations.includes(user.id) }));

        const embed = new EmbedBuilder()
            .setTitle("Confirmations")
            .setDescription(users.length == 0 ? "No Players" : confirmations.reduce((previous, current) => previous += ((current.confirmed ? "✅" : process.env.FALSE) + " " + current.name) + "\n", ""))
            .setFooter({ text: "Showing confirmations for " +  game.name + "." });

        await interaction.reply({ embeds: [embed] });
        
    }
} satisfies Subcommand;