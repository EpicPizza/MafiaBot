import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandGroupBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { addSignup, getGameByName, refreshSignup, removeSignup } from "../../utils/mafia/games";
import { getUserByName } from "../../utils/mafia/user";
import { Subcommand } from "../../utils/subcommands";
import { isGameStarted } from "../../utils/mafia/state";

// Mod tools for managing signups. Intentionally skips the closed/locked checks that player-facing signup commands enforce.
export const SignupCommand = {
    name: "signup",
    subcommand: true,

    slash: new SlashCommandSubcommandGroupBuilder()
        .setName("signup")
        .setDescription("Manage signups.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a player to a game's signups, even if signups are closed.")
                .addStringOption(option =>
                    option
                        .setName("player")
                        .setDescription("Nickname of player.")
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option
                        .setName("game")
                        .setDescription("Name of game.")
                        .setRequired(true)
                        .setAutocomplete(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("transfer")
                .setDescription("Move a player's signup from one game to another, even if signups are closed.")
                .addStringOption(option =>
                    option
                        .setName("player")
                        .setDescription("Nickname of player.")
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option
                        .setName("from")
                        .setDescription("Game to move the player out of.")
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option
                        .setName("to")
                        .setDescription("Game to move the player into.")
                        .setRequired(true)
                        .setAutocomplete(true))
        ),
    text: () => {
        const signup = new Command()
            .name('signup')
            .description('Manage signups, even if signups are closed.');

        signup.command('add')
            .description('Add a player to a game\'s signups.')
            .argument('<nickname>', 'nickname of player', fromZod(z.string().min(1).max(100)))
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)));

        signup.command('transfer')
            .description('Move a player\'s signup from one game to another.')
            .argument('<nickname>', 'nickname of player', fromZod(z.string().min(1).max(100)))
            .argument('<gameFrom>', 'game to move from', fromZod(z.string().min(1).max(100)))
            .argument('<gameTo>', 'game to move to', fromZod(z.string().min(1).max(100)));

        signup.commands.forEach(command => command.exitOverride());

        return signup;
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        let action: string;
        let args: string[];

        if(interaction.type == 'text') {
            const name = interaction.program.args[0];
            const sub = interaction.program.commands.find(command => command.name() == name);

            if(sub == undefined) throw new Error("Unknown action. Use add or transfer.");

            action = sub.name();
            args = sub.processedArgs as string[];
        } else {
            action = interaction.options.getSubcommand();
            args = action == 'add'
                ? [interaction.options.getString('player', true), interaction.options.getString('game', true)]
                : [interaction.options.getString('player', true), interaction.options.getString('from', true), interaction.options.getString('to', true)];
        }

        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const user = await getUserByName(args[0], interaction.instance);

        if(!user) throw new Error("Player not found.");

        const isStarted = (id: string) => isGameStarted(interaction.instance, id);

        let reply: string;

        if(action == 'add') {
            const game = await getGameByName(args[1], interaction.instance);

            if(game == null) throw new Error("Game not found.");
            if(await isStarted(game.id)) throw new Error(game.name + " has already started. Use ?adv add to add a player midgame.");
            if(game.signups.includes(user.id)) throw new Error(user.nickname + " is already signed up for " + game.name + ".");

            await addSignup({ id: user.id, game: game.name }, interaction.instance);
            await refreshSignup(game.name, interaction.instance);

            reply = user.nickname + " added to " + game.name + ".";
        } else if(action == 'transfer') {
            const from = await getGameByName(args[1], interaction.instance);
            const to = await getGameByName(args[2], interaction.instance);

            if(from == null) throw new Error("Game to transfer from not found.");
            if(to == null) throw new Error("Game to transfer to not found.");
            if(from.id == to.id) throw new Error("Cannot transfer to the same game.");
            if(await isStarted(from.id)) throw new Error(from.name + " has already started. Cannot transfer players out of a running game.");
            if(await isStarted(to.id)) throw new Error(to.name + " has already started. Use ?adv add to add a player midgame.");
            if(!from.signups.includes(user.id)) throw new Error(user.nickname + " is not signed up for " + from.name + ".");

            await removeSignup({ id: user.id, game: from.name }, interaction.instance);
            if(!to.signups.includes(user.id)) await addSignup({ id: user.id, game: to.name }, interaction.instance);

            await refreshSignup(from.name, interaction.instance);
            await refreshSignup(to.name, interaction.instance);

            reply = user.nickname + " transferred from " + from.name + " to " + to.name + ".";
        } else {
            throw new Error("Unknown action. Use add or transfer.");
        }

        if(interaction.type != 'text') {
            await interaction.editReply({ content: reply });
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;
