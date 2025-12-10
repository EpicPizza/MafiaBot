import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { getEnabledExtensions } from "../../utils/extensions";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal, type Global } from '../../utils/global';
import { getGameByID, getGameSetup, Signups } from "../../utils/mafia/games";
import { getUserByName } from "../../utils/mafia/user";
import { getSetup, Setup, } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const KillCommand = {
    name: "kill",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("kill")
        .setDescription("Kill a player without giving them spectator.")
        .addStringOption(option =>
            option
                .setName("player")
                .setDescription("Which player to add.")
                .setRequired(true)
                .setAutocomplete(true)),
    text: () => {
        return new Command()
            .name('kill')
            .description('Does not add spectator roles immediently after removing. Will kick player out of the mafia server if they are mafia. Use /mod spectator or ?mod spectator to add spectator roles to them later or ending the game will add spectator roles as well.')
            .argument('<player>', 'nickname of player', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const playerInput = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');
        if(playerInput == null) throw new Error("Choose a player.");

        const global = await getGlobal();
        const setup  = await getSetup();

        await killPlayer(playerInput, global, setup);
        
        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Player killed."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;

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

export async function killPlayer(name: string, global: Global, setup: Setup) {
    if(global.started == false) throw new Error("Game has not started.");

    const game = await getGameByID(global.game ?? "");
    const gameSetup = await getGameSetup(game, setup);
    
    const user = await getUserByName(name);
    if(!user) throw new Error("Player not found.");

    const main = await setup.primary.guild.members.fetch(user.id).catch(() => undefined);
    if(main == null) throw new Error("Member not found.");
    await main.roles.remove(setup.primary.alive);

    const mafia = await setup.tertiary.guild.members.fetch(user.id).catch(() => undefined);
    if(mafia != null) await mafia.kick();

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('game');

    await db.runTransaction(async t => {
        const global = await getGlobal(t);

        t.update(ref, {
            players: global.players.filter(player => player.id != user.id)
        })
    });

    await onRemove(global, setup, game, user.id);
}