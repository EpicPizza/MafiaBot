import { APIActionRowComponent, APIButtonComponent, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, CommandInteraction, ComponentType, EmbedBuilder, Interaction, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel, TextInputBuilder, TextInputStyle } from "discord.js";
import client, { Command, Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { createUser, editUser, getUser } from "../utils/user";
import { endGame, getGlobal, getGameByID, getGameByName, setAllignments, startGame, unlockGame, lockGame, getAllCurrentNicknames, getAllNicknames } from "../utils/main";
import { DateTime, SystemZone, Zone } from 'luxon';
import { getFuture, parse, setFuture } from "../utils/timing";
import { getSetup } from "../utils/setup";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { activateSignup, archiveGame, closeSignups, createGame, getGameSetup, getGames, openSignups, refreshSignup, removeSignup } from "../utils/games";
import { ModCommand } from "./mod/mod";

dnt.plugin(meridiem);

const mod = ModCommand();

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-mod',
            command: () => {
                const command = new SlashCommandBuilder()
                    .setName('mod')
                    .setDescription('Mod only commands.')
                
                mod.getBuilders().forEach(subcommand => {
                    command.addSubcommand(subcommand);
                })

                return command;
            }   
        },
        mod.getTextCommand(),
        ...mod.getInteractions()
    ] satisfies Data[],

    execute: async (interaction: Interaction | Command) => {
        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused(true);

            if(focusedValue.name == "game") {
                const games = await getGames();

                const filtered = games.filter(choice => choice.name.startsWith(focusedValue.value)).slice(0, 25);;

                await interaction.respond(
                    filtered.map(choice => ({ name: choice.name, value: choice.name })),
                );
            } else {
                const nicknames = await getAllNicknames();
                
                const filtered = nicknames.filter(choice => choice.toLowerCase().startsWith(focusedValue.value.toLowerCase())).slice(0, 25);;

                await interaction.respond(
                    filtered.map(choice => ({ name: choice, value: choice })),
                );
            }

            return;
        } 

        const setup  = await getSetup();
        if(typeof setup == 'string') throw new Error("Setup Incomplete");
        const member = await setup.primary.guild.members.fetch(interaction.user.id);
        if(!member?.roles.cache.has(setup.primary.mod.id)) throw new Error("You're not a mod!");

        if(interaction.type == 'text' || interaction.isChatInputCommand()) {
            await mod.handleCommand(interaction)
        } else if(interaction.isButton() || interaction.isStringSelectMenu()) {
            await mod.handleInteraction(interaction);
        }
    }
}
