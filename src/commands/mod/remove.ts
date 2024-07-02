import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, TextCommandArguments, removeReactions } from "../../discord";
import { z } from "zod";
import { getGameByID, getGameByName, getGlobal, setMafiaSpectator } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";
import { getSetup } from "../../utils/setup";
import { User, getUser } from "../../utils/user";
import { getGameSetup } from "../../utils/games";

export const RemoveCommand = {
    name: "remove",
    description: "?mod remove {nickname}",
    command: {
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
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: ChatInputCommandInteraction | Command) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const global = await getGlobal();

        const setup  = await getSetup();
        if(typeof setup == 'string') throw new Error("Setup Incomplete");

        if(setup.primary.mod.members.get(interaction.user.id) == undefined) throw new Error("You're not a mod!");

        const game = await getGameByID(global.game ?? "");

        const gameSetup = await getGameSetup(game, setup);

        if(global.started == false) throw new Error("Game has not started.");

        const player = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('player');

        if(player == null) throw new Error("Choose a player.");

        const list = [] as User[];

        for(let i = 0; i < global.players.length; i++) {
            const user = await getUser(global.players[i].id);

            if(user == null) throw new Error("User not registered.");

            list.push(user);
        }

        const user = list.find(user => user.nickname == capitalize(player));

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

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Player removed."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
}

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
}