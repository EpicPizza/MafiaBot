import { Command } from "commander";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data, Event, TextCommand } from '../discord';
import { getFuture, getGrace, setFuture, setGrace } from "../utils/mafia/timing";
import { removeReactions } from "../discord/helpers";
import { killPlayer } from "./advance/kill";
import { z } from "zod";
import { setupPlayer } from "../utils/mafia/main";
import { getGameByID, getGameSetup } from "../utils/mafia/games";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-timeout',
            command: new SlashCommandBuilder()
                .setName("timeout")
                .setDescription("Trigger a timeout.")
        },
        {
            type: 'text',
            name: 'text-timeout',
            command: () => {
                return new Command()
                    .name('timeout')
                    .description('Trigger a timeout.')
            }
        },
        {
            type: 'button',
            name: 'button-confirm',
            command: z.object({
                name: z.literal('players'),
                game: z.string(),
                format: z.string().optional(),
            })
        },
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand | ButtonInteraction>) => {
        interaction.inInstance();

        const global = interaction.instance.global;
        if(!global.started) throw new Error("Game not started.");
        
        let isButton = "customId" in interaction;
        if (!isButton) {
            
            // ask player to confirm
            
            const embed = new EmbedBuilder()
                .setTitle("Confirm")
                .setDescription("Alej says that you have to click the button. Click at your own risk.")
                .setColor(Colors.Blue);
    
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents([
                    new ButtonBuilder() 
                        .setCustomId(JSON.stringify({name: "confirm"}))
                        .setStyle(ButtonStyle.Danger)
                        .setLabel("Confirm"),
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
            // set grace to 15 mins
            let newGraceTime = new Date().valueOf() + 15 /* mins */ * 1000 /* ms per sec */ * 60 /* sec per min */;
            let oldGrace = await getGrace(interaction.instance);
            if (oldGrace && oldGrace.when.valueOf() > newGraceTime) {
            } else {
                setGrace(true, new Date(newGraceTime), interaction.instance);
            }
            
            // kill the player
            killPlayer(interaction.name, interaction.instance);
            
            // extend future
            let newFutureTime = new Date().valueOf() + 15 /* mins */ * 1000 /* ms per sec */ * 60 /* sec per min */;
            let oldFuture = await getFuture(interaction.instance);
            let doSetFuture = !oldFuture || oldFuture.when.valueOf() < newFutureTime;
            if (doSetFuture) {
                setFuture(new Date(newFutureTime), true, true, true, interaction.instance);
            }
            interaction.instance.setup.primary.chat.send(`${interaction.name } has triggered a 15 minute timeout. They have taken themselves out of the chat for the next 15 minutes. Voting is disabled. Please respect this time and give ${interaction.name} space. Please play wiht good sportmanship and be kind to you fellow players!${
                doSetFuture ? `\n-# Day will end at <t:${Math.round(newFutureTime / 1000)}:T> instead.` : ""
            }`);
            interaction.instance.setup.secondary.logs.send(`@${interaction.instance.setup.secondary.mod.id}, ${interaction.name} has triggered a 15 minute timeout.`);
            
            await new Promise(resolve => setTimeout(resolve, 15 /* mins */ * 60 /* secs per min */));
            // IMPORTANT! DO NOT RESTART MAFIABOT WHILE SOMEONE IS IN TIMEOUT
            
            // unkill the player
            const game = await getGameByID(global.game ?? "", interaction.instance);
            const gameSetup = await getGameSetup(game, interaction.instance.setup);
            await setupPlayer(interaction.user.id, gameSetup, interaction.instance);
        }
    }
}