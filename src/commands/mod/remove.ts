import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { getEnabledExtensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal, type Global } from '../../utils/global';
import { Signups, getGameByID, getGameSetup } from "../../utils/mafia/games";
import { setMafiaSpectator } from "../../utils/mafia/main";
import { getUserByName } from "../../utils/mafia/user";
import { checkMod } from "../../utils/mod";
import { Setup, getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const RemoveCommand = {
    name: "remove",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('remove')
        .setDescription('Remove a player.')
        .addStringOption(option =>
            option  
                .setName('player')
                .setDescription('Which player to remove?')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('remove')
            .description('remove a player')
            .argument('<player>', 'which player', fromZod(z.string().min(1).max(100)));
    },
    
    execute: async (interaction: ChatInputCommandInteraction | TextCommand) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const global = await getGlobal();
        const setup  = await getSetup();

        checkMod(setup, global, interaction.user.id, 'message' in interaction ? interaction.message?.guild?.id ?? "" : interaction.guildId ?? "");

        const player = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');
        if(player == null) throw new Error("Choose a player.");

        await removePlayer(player, global, setup);

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Player removed."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;

export async function removePlayer(name: string, global: Global, setup: Setup) {
    if(global.started == false) throw new Error("Game has not started.");

    const game = await getGameByID(global.game ?? "");
    const gameSetup = await getGameSetup(game, setup);

    const user = await getUserByName(name);
    if(!user) throw new Error("Player not found.");

    if(typeof setup == 'string') throw new Error("Incomplete Setup");

    const main = await setup.primary.guild.members.fetch(user.id).catch(() => undefined);
    if(main == null) throw new Error("Member not found.");
    await main.roles.remove(setup.primary.alive);

    const dead = await setup.secondary.guild.members.fetch(user.id).catch(() => undefined);
    if(dead == null) throw new Error("Member not found.");
    await dead.roles.add(setup.secondary.spec);

    const mafia = await setup.tertiary.guild.members.fetch(user.id).catch(() => undefined);
    await setMafiaSpectator(mafia, main.id, setup, gameSetup, user);

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await db.runTransaction(async t => {
        const global = await getGlobal(t);

        t.update(ref, {
            players: global.players.filter(player => player.id != user.id)
        })
    });

    await onRemove(global, setup, game, user.id);
}

export async function onRemove(global: Global, setup: Setup, game: Signups, removed: string) {
    const extensions = await getEnabledExtensions(global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onRemove(global, setup, game, removed)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
}