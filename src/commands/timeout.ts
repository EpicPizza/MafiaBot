import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data, Event, TextCommand } from '../discord';
import { getFuture, getGrace, setFuture, setGrace } from "../utils/mafia/timing";
import { removeReactions } from "../discord/helpers";
import { killPlayer } from "./advance/kill";
import { z } from "zod";
import { setupPlayer } from "../utils/mafia/main";
import { getGameByID, getGameSetup } from "../utils/mafia/games";
import { firebase } from "googleapis/build/src/apis/firebase";
import { firebaseAdmin } from "../utils/firebase";
import { getUser } from "../utils/mafia/user";
import { FieldValue } from "firebase-admin/firestore";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-timeout',
            command: new SlashCommandBuilder()
                .setName("timeout")
                .setDescription("Trigger a timeout. This will temporarily remove you from the game for 15 minutes and pause votes.")
        },
        {
            type: 'text',
            name: 'text-timeout',
            command: () => {
                return new Command()
                    .name('timeout')
                    .description('Trigger a timeout. This will temporarily remove you from the game for 15 minutes and pause votes. This cannot be undone.')
            }
        },
        {
            type: 'button',
            name: 'button-confirm',
            command: z.object({
                name: z.literal('confirm'),
            })
        },
        {
            type: 'button',
            name: 'button-cancel',
            command: z.object({
                name: z.literal('cancel'),
            })
        },
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand | ButtonInteraction>) => {
        interaction.inInstance();

        const global = interaction.instance.global;
        if(!global.started) throw new Error("Game not started.");
        
        if (!("customId" in interaction)) {
            
            // ask player to confirm
            
            const embed = new EmbedBuilder()
                .setTitle("Confirm Timeout")
                .setDescription("This will temporarily remove you from the game for 15 minutes and pause votes. This cannot be undone.")
                .setColor(Colors.Red);
    
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents([
                    new ButtonBuilder() 
                        .setCustomId(JSON.stringify({name: "confirm"}))
                        .setStyle(ButtonStyle.Danger)
                        .setLabel("Confirm"),
                    new ButtonBuilder() 
                        .setCustomId(JSON.stringify({name: "cancel"}))
                        .setStyle(ButtonStyle.Secondary)
                        .setLabel("Cancel"),
                ]);
            
            if(interaction.type != 'text') {
                await interaction.editReply({
                    embeds: [embed],
                    components: [row],
                })
            } else {
                await removeReactions(interaction.message);
    
                 await interaction.reply({
                    embeds: [embed],
                    components: [row],
                })
            }
            
        } else {
            const id = JSON.parse(interaction.customId);

            if(id.name == "cancel") {
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents([
                        new ButtonBuilder() 
                            .setCustomId(JSON.stringify({name: "cancel"}))
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                            .setLabel("Cancelled"),
                    ]);

                await interaction.update({
                    components: [row],
                });

                return;
            } else {
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents([
                        new ButtonBuilder() 
                            .setCustomId(JSON.stringify({name: "confirm"}))
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                            .setLabel("Confirmed"),
                    ]);

                await interaction.update({
                    components: [row],
                });
            }

            const db = firebaseAdmin.getFirestore();
            const ref = db.collection('instances').doc(interaction.instance.id).collection('settings').doc('game');

            const game = await getGameByID(global.game ?? "", interaction.instance);
            const gameSetup = await getGameSetup(game, interaction.instance.setup);
            
            const user = await getUser(interaction.user.id, interaction.instance);
            if(!user) throw new Error("Player not found.");

            const alignment = global.players.find(player => player.id == user.id)?.alignment ?? null;

            await db.runTransaction(async t => {
                t.update(ref, {
                    players: global.players.filter(player => player.id != user.id),
                    grace: true,
                })
            });

            let main = await interaction.instance.setup.primary.guild.members.fetch(user.id).catch(() => undefined);
            if(main != null) await main.roles.remove(interaction.instance.setup.primary.alive);

            let mafia = await interaction.instance.setup.tertiary.guild.members.fetch(user.id).catch(() => undefined);
            if(mafia != null) await mafia.roles.remove(interaction.instance.setup.tertiary.access);

            // set grace to 15 mins
            let newGraceTime = new Date().valueOf() + 15 /* mins */ * 1000 /* ms per sec */ * 60 /* sec per min */;
            let oldGrace = await getGrace(interaction.instance);
            if (oldGrace && oldGrace.when.valueOf() > newGraceTime) {
            } else {
                await setGrace(true, new Date(newGraceTime), interaction.instance);
            }
            
            // extend future
            let newFutureTime = new Date().valueOf() + 30 /* mins */ * 1000 /* ms per sec */ * 60 /* sec per min */;
            let oldFuture = await getFuture(interaction.instance);
            console.log("Old Future", oldFuture?.when.toLocaleTimeString());
            console.log("New Future", new Date(newFutureTime).toLocaleTimeString());
            let doSetFuture = oldFuture != undefined && newFutureTime > oldFuture.when.valueOf();
            if (doSetFuture) {
                await setFuture(new Date(newFutureTime), false, true, false, interaction.instance);
            }

            const embed = new EmbedBuilder()
                .setTitle(`${user.nickname} has triggered a timeout.`)
                .setDescription(`They have taken themselves out of the chat for the next 15 minutes, voting will be disabled for this duration. Please respect this time and give ${interaction.name} space. Please play with good sportmanship and be kind to you fellow players!\n${doSetFuture ? `\n-# Day will end at <t:${Math.round(newFutureTime / 1000)}:T> instead.` : ""}`)
                .setColor(Colors.Red);

            await interaction.instance.setup.primary.chat.send({ content: `<@&${interaction.instance.setup.primary.alive.id}>`, embeds: [embed] });
            await interaction.instance.setup.secondary.logs.send(`<@&${interaction.instance.setup.secondary.mod.id}>, ${user.nickname} has triggered a 15 minute timeout.`);
            
            await new Promise(resolve => setTimeout(resolve, 15 /* mins */ * 60 /* secs per min */ * 1000 /* millseconds per second */));
            // IMPORTANT! DO NOT RESTART MAFIABOT WHILE SOMEONE IS IN TIMEOUT

            main = await interaction.instance.setup.primary.guild.members.fetch(user.id).catch(() => undefined);
            if(main != null) await main.roles.add(interaction.instance.setup.primary.alive);

            mafia = await interaction.instance.setup.tertiary.guild.members.fetch(user.id).catch(() => undefined);
            if(mafia != null) await mafia.roles.add(interaction.instance.setup.tertiary.access);

            await ref.update({
                players: FieldValue.arrayUnion({
                    id: interaction.user.id,
                    alignment: alignment,
                })
            });
        }
    }
}