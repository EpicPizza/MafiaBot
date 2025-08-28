import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import client, { Command, removeReactions, TextCommandArguments } from "../../discord";
import { archiveGame, createGame, getGameSetup } from "../../utils/games";
import { z } from "zod";
import { getGameByName } from "../../utils/main";
import { getUserByName, getUsersArray } from "../../utils/user";
import { firebaseAdmin } from "../../utils/firebase";
import { getSetup } from "../../utils/setup";

export const CreateCommand = {
    name: "create",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName('create')
            .setDescription("Creates a mafia game.")
            .addStringOption(option =>
                option  
                    .setName('game')
                    .setDescription('Name of the game.')
                    .setRequired(true)
            ),
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await createGame(interaction, name);
    }
}

export const ArchiveCommand = {
    name: "archive",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("archive")
            .setDescription("Archives a game.")
            .addStringOption(option =>
                option  
                    .setName('game')
                    .setDescription('Name of the game.')
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        await archiveGame(interaction, name);
    }
}

export const ResendConfirmationsCommand = {
    name: "resend",
    command: {
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
        text: {
            required: [ z.string().min(1).max(100) ],
            optional: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
        
        const gameName = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');
        const playerName = interaction.type == 'text' ? (interaction.arguments.length > 2 ? interaction.arguments[2] : undefined) as string | undefined : interaction.options.getString('player') ?? undefined;

        if(gameName == null) throw new Error("Game needs to be specified.");

        const setup = await getSetup();
        const game = await getGameByName(gameName);
        const gameSetup = await getGameSetup(game, setup);

        const player = playerName ? await getUserByName(playerName) : undefined;
        if(player == undefined && playerName != undefined) throw new Error("Player not found!");
        const players = player ? [ player ] : await getUsersArray(game.signups);

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
}

export const ConfirmationsCommand = {
    name: "confirmations",
    command: {
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
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        const game = await getGameByName(name);
        const users = await getUsersArray(game.signups);

        const confirmations = users.map(user => ({ name: user.nickname, confirmed: game.confirmations.includes(user.id) }));

        const embed = new EmbedBuilder()
            .setTitle("Confirmations")
            .setDescription(users.length == 0 ? "No Players" : confirmations.reduce((previous, current) => previous += ((current.confirmed ? "✅" : process.env.FALSE) + " " + current.name) + "\n", ""))
            .setFooter({ text: "Showing confirmations for " +  game.name + "." });

        await interaction.reply({ embeds: [embed] });
        
    }
}