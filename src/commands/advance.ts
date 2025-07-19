import { APIActionRowComponent, APIButtonComponent, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, CommandInteraction, ComponentType, EmbedBuilder, Interaction, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel, TextInputBuilder, TextInputStyle } from "discord.js";
import client, { Command, Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { createUser, editUser, getUser } from "../utils/user";
import { endGame, getGlobal, getGameByID, getGameByName, startGame, unlockGame, lockGame, getAllNicknames } from "../utils/main";
import { DateTime, SystemZone, Zone } from 'luxon';
import { getFuture, parse, setFuture } from "../utils/timing";
import { getSetup } from "../utils/setup";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { activateSignup, archiveGame, closeSignups, createGame, getGameSetup, getGames, openSignups, refreshSignup, removeSignup } from "../utils/games";
import { extensions } from "../utils/extensions";
import { checkMod } from "../utils/mod";
import { AdvanceCommand } from "./advance/advance";

dnt.plugin(meridiem);

const advance = AdvanceCommand();

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-advance',
            command: () => {
                const command = new SlashCommandBuilder()
                    .setName('advance')
                    .setDescription('Advance only commands.')
                
                advance.getBuilders().forEach(subcommand => {
                    if('addSubcommand' in subcommand) {
                        command.addSubcommandGroup(subcommand);
                    } else {
                        command.addSubcommand(subcommand);
                    }
                })

                return command;
            }   
        },
        advance.getTextCommand(),
        ...advance.getInteractions()
    ] satisfies Data[],

    execute: async (interaction: Interaction | Command) => {
        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused(true);

            if(focusedValue.name == "game") {
                const games = await getGames();

                const filtered = games.filter(choice => choice.name.startsWith(focusedValue.value)).slice(0, 25);

                await interaction.respond(
                    filtered.map(choice => ({ name: choice.name, value: choice.name })),
                );
            } else if(focusedValue.name == "player" || focusedValue.name == "for") {
                const nicknames = await getAllNicknames();
                
                const filtered = nicknames.filter(choice => choice.toLowerCase().startsWith(focusedValue.value.toLowerCase())).slice(0, 25);

                await interaction.respond(
                    filtered.map(choice => ({ name: choice, value: choice })),
                );
            } else {
                const action = interaction.options.getSubcommand();

                const global = await getGlobal();

                let names = extensions.map(extension => extension.name).splice(0, 25);

                switch(action) {
                    case 'disable':
                        names = names.filter(extension => global.extensions.find(enabled => enabled == extension));
                        break;
                    case 'enable':
                        names = names.filter(extension => !global.extensions.find(enabled => enabled == extension));
                        break;
                }

                await interaction.respond(
                    names.map(choice => ({ name: choice + " Extension", value: choice })),
                );
            }

            return;
        } 

        const setup  = await getSetup();
        if(typeof setup == 'string') throw new Error("Setup Incomplete");

        await checkMod(setup, interaction.user.id, 'message' in interaction ? interaction.message?.guild?.id ?? "" : interaction.guildId ?? "");

        if(interaction.type == 'text' || interaction.isChatInputCommand()) {
            await advance.handleCommand(interaction)
        } else if(interaction.isButton() || interaction.isStringSelectMenu()) {
            await advance.handleInteraction(interaction);
        }
    }
}
