import { ActionRowBuilder, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { getGlobal, getGameByName, lockGame, getGameByID, getAllCurrentNicknames } from "../utils/main";
import { User, getUser } from "../utils/user";
import { getSetup } from "../utils/setup";
import { register } from "../register";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-remove',
            command: new SlashCommandBuilder()
                .setName('remove')
                .setDescription('Remove a player.')
                .addStringOption(option =>
                    option  
                        .setName('player')
                        .setDescription('Which player to remove?')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | AutocompleteInteraction) => {
        if(interaction.isAutocomplete()) {
            const global = await getGlobal();

            const focusedValue = interaction.options.getFocused();

            const nicknames = await getAllCurrentNicknames(global);

            const filtered = nicknames.filter(choice => choice.startsWith(focusedValue)).slice(0, 25);;

            await interaction.respond(
                filtered.map(choice => ({ name: choice, value: choice })),
            );

            return;
        } 

        await interaction.deferReply({ ephemeral: true });

        const global = await getGlobal();

        const setup  = await getSetup();
        if(typeof setup == 'string') throw new Error("Setup Incomplete");

        if(setup.primary.mod.members.get(interaction.user.id) == undefined) throw new Error("You're not a mod!");

        if(global.started == false) throw new Error("Game has not started.");

        const player = interaction.options.getString('player');

        if(player == null) throw new Error("Choose a player.");

        const list = [] as User[];

        for(let i = 0; i < global.players.length; i++) {
            const user = await getUser(global.players[i].id);

            if(user == null) throw new Error("User not registered.");

            list.push(user);
        }

        const user = list.find(user => user.nickname == player);

        if(!user) throw new Error("Player not found.");

        if(typeof setup == 'string') throw new Error("Incomplete Setup");

        const main = await setup.primary.guild.members.fetch(user.id).catch(() => undefined);
        if(main == null) throw new Error("Member not found.");
        await main.roles.remove(setup.primary.alive);

        const dead = await setup.secondary.guild.members.fetch(user.id).catch(() => undefined);
        if(dead == null) throw new Error("Member not found.");
        await dead.roles.add(setup.secondary.spec);

        const mafia = await setup.tertiary.guild.members.fetch(user.id).catch(() => undefined);
        if(mafia) {
            await mafia.roles.remove(setup.tertiary.access);
            await mafia.roles.add(setup.tertiary.spec);
        }

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = await getGlobal(t);

            t.update(ref, {
                players: global.players.filter(player => player.id != user.id)
            })
        });

        await register();

        await interaction.editReply({ content: "Player removed."});
    } 
}