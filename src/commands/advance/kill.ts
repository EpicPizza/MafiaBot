import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByID, getGlobal, lockGame, setupPlayer } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, getUserByName, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global} from "../../utils/main";
import { firebaseAdmin } from "../../utils/firebase";
import { FieldValue } from "firebase-admin/firestore";

export const KillCommand = {
    name: "kill",
    description: "?adv kill {nickname}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("kill")
            .setDescription("Kill a player without giving them spectator.")
            .addStringOption(option =>
                option
                    .setName("player")
                    .setDescription("Which player to add.")
                    .setRequired(true)
                    .setAutocomplete(true)),
        text: {
            required: [ z.string() ],
            optional: []
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const playerInput = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('player');
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

    const ref = db.collection('settings').doc('game');

    await db.runTransaction(async t => {
        const global = await getGlobal(t);

        t.update(ref, {
            players: global.players.filter(player => player.id != user.id)
        })
    });

    await onRemove(global, setup, game, user.id);
}