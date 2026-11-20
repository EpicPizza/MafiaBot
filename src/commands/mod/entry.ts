import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Event, type TextCommand } from '../../discord';
import client from "../../discord/client";
import { removeReactions } from "../../discord/helpers";
import { firebaseAdmin } from "../../utils/firebase";
import { getCommandGame } from "../../utils/mafia/context";
import { onjoin } from "../../utils/mafia/invite";
import { getUser, User } from "../../utils/mafia/user";
import { Subcommand } from "../../utils/subcommands";

/**
 * Queues mafia server invite entries for players who aren't in the mafia server yet.
 *
 * Everyone plays from the mafia server, and mafia only differ by a permission overwrite on the mafia channel.
 * ?advance mafia queues an entry (and an invite) for a mafia player who isn't in the server, so if only mafia
 * ever got invites, getting one would give the role away. This gives any player the same kind of invite and entry:
 * same server, same invite channel, tagged with the game. Mafia players keep their access entry; this one adds nothing.
 */
export const EntryCommand = {
    name: "entry",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('entry')
        .setDescription('Queue mafia server invite entries for players not in the mafia server.')
        .addStringOption(option =>
            option
                .setName('players')
                .setDescription('Nicknames, separated by spaces or commas. Use "all" for every player in the game.')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName('dm')
                .setDescription('DM each player their invite. Defaults to false (links are sent to you).')
        ),
    text: () => {
        return new Command()
            .name('entry')
            .description('Queue mafia server invite entries for players not in the mafia server. Use "all" for every player in the game.')
            .argument('<players...>', 'nicknames of players, or all')
            .option('-d, --dm', 'DM each player their invite instead of listing the links');
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const ctx = await getCommandGame(interaction);
        const setup = interaction.instance.setup;

        const names = (interaction.type == 'text' ? (interaction.program.processedArgs[0] as string[]).join(" ") : interaction.options.getString('players', true))
            .split(/[\s,]+/)
            .map(name => name.trim().toLowerCase())
            .filter(name => name.length > 0);

        const dm = interaction.type == 'text' ? interaction.program.getOptionValue('dm') === true : interaction.options.getBoolean('dm') ?? false;

        if(names.length == 0) throw new Error("List at least one player.");

        const players = [] as User[];

        for(const player of ctx.state.players) {
            const user = await getUser(player.id, interaction.instance);

            if(user == undefined) throw new Error("User not registered.");

            players.push(user);
        }

        const all = names.includes("all");
        const missing = all ? [] : names.filter(name => !players.some(user => user.nickname.toLowerCase() == name));

        if(missing.length > 0) throw new Error("Players not found in this game: " + missing.join(", ") + ".");

        const chosen = all ? players : players.filter(user => names.includes(user.nickname.toLowerCase()));

        const queued = firebaseAdmin.getFirestore().collection('instances').doc(interaction.instance.id).collection('roles');

        const links = [] as string[];
        const skipped = [] as string[];
        const failedDMs = [] as string[];

        for(const user of chosen) {
            const member = await setup.tertiary.guild.members.fetch(user.id).catch(() => undefined);

            if(member != undefined) {
                skipped.push(user.nickname);

                continue;
            }

            // ?advance mafia may have queued this player already; a second entry would just show up twice in the logs.
            const existing = await queued.where('id', '==', user.id).where('server', '==', 'tertiary').where('game', '==', ctx.game.id).limit(1).get();

            if(existing.empty) {
                await onjoin({
                    id: user.id,
                    server: "tertiary",
                    roles: {},
                    game: ctx.game.id,
                }, interaction.instance);
            }

            // Same channel as ?advance mafia's invites, so the two can't be told apart.
            const invite = await setup.tertiary.guild.invites.create(ctx.gameSetup.mafia, { unique: true });
            const link = "https://discord.com/invite/" + invite.code;

            if(dm) {
                const channel = await client.users.fetch(user.id).then(found => found.createDM()).catch(() => undefined);
                const sent = channel && await channel.send("Join the mafia server to play! Here's a server invite: \n" + link).then(() => true).catch(() => false);

                if(!sent) {
                    failedDMs.push(user.nickname);
                    links.push(user.nickname + ": " + link);
                }
            } else {
                links.push(user.nickname + ": " + link);
            }
        }

        const queuedCount = chosen.length - skipped.length;

        let message = `Queued ${queuedCount} mafia server entr${queuedCount == 1 ? "y" : "ies"}` + (dm ? " and DMed the invites" : "") + ".";

        if(skipped.length > 0) message += "\nAlready in the mafia server: " + skipped.join(", ") + ".";
        if(failedDMs.length > 0) message += "\nCouldn't DM: " + failedDMs.join(", ") + ", send these yourself.";
        if(links.length > 0) message += "\n\n" + links.join("\n");

        if(interaction.type != 'text') {
            await interaction.editReply({ content: message });
        } else {
            await removeReactions(interaction.message);

            // Links go to the spectator chat rather than the channel the command ran in, like ?advance mafia.
            await ctx.gameSetup.spec.send({ content: "<@" + interaction.user.id + "> " + message, allowedMentions: { parse: [] } });

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;
