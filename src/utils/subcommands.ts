import { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, StringSelectMenuInteraction } from "discord.js";
import type { TextCommand } from '../discord';
import { ZodObject } from "zod";
import { Command } from "commander";
import path from 'node:path';
import fs from 'node:fs';

export interface Subcommand { 
    name: string, 
    execute: Function, 
    slash: SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder, 
    text: () => Command,
    subcommand: true,
}

export interface Subinteraction { 
    name: string, 
    type: string, 
    command: ZodObject<any>, 
    execute: Function 
    subcommand: true,
}

export function subcommandBuilder(subcommandsPath: string, name: string, description: string, textShortcut: string | undefined = undefined) {
    const subcommandsFiles = fs.readdirSync(subcommandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    const commands = [] as Subcommand[]; 
    const interactions = [] as Subinteraction[]; 

    for(const file of subcommandsFiles) {
        const filePath = path.join(subcommandsPath, file);
        const exports = Object.values(require(filePath)).filter(check => typeof check == 'object' && check != null && ('subcommand' in check));

        commands.push(... exports.filter(sub => 'text' in sub) as unknown as Subcommand[]);
        interactions.push(... exports.filter(sub => 'command' in sub) as unknown as Subinteraction[]);
    }

    console.log('Interactions registered via ' + name + ':', interactions.map(interaction => interaction.name)); 

    function getSlashCommand() {
        const command = new SlashCommandBuilder()
            .setName(name)
            .setDescription(description)
        
        commands.map(command => command.slash).forEach(subcommand => {
            if('addSubcommand' in subcommand) {
                command.addSubcommandGroup(subcommand);
            } else {
                command.addSubcommand(subcommand);
            }
        })

        return { 
            type: 'slash' as 'slash',
            name: 'slash-' + name,
            command: command,
        };
    }

    function getInteractions() {
        return interactions.map(interaction => ({ name: interaction.name, type: interaction.type as "select" | "button" | "modal", command: interaction.command }) )
    }

    function getTextCommand() {
        return {
            type: "text" as "text",
            name: "text-" + (textShortcut ? textShortcut : name),
            command: () => {
                const group = new Command()
                    .name((textShortcut ? textShortcut : name))
                    .description(description)
                    
                commands.forEach(command => {
                    const subcommand = command.text();

                    subcommand.exitOverride();

                    group.addCommand(subcommand);
                });

                return group;
            }
        }
    }

    async function handleCommand(interaction: TextCommand | ChatInputCommandInteraction) {
        const name = interaction.type == 'text' ? interaction.program.args[0] as string : interaction.options.getSubcommandGroup() ?? interaction.options.getSubcommand();

        const command = commands.find(command => command.name == name);

        if(command == undefined) return await interaction.reply("Subcommand not found.");

        if(interaction.type == 'text') {
            const subcommand = interaction.program.commands.find(command => command.name() == name);

            if(subcommand == undefined) return await interaction.reply("Subcommand not found. [of parser]");

            interaction.program = subcommand;
        }

        await command.execute(interaction);
    }

    async function handleInteraction(interaction: StringSelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction) {
        const name = (interaction.isButton() ? "button-" : interaction.isAnySelectMenu() ? "select-" : "modal-") + JSON.parse(interaction.customId).name;

        const command = interactions.find(interaction => interaction.name == name);

        if(command == undefined) return await interaction.reply("(Sub)Interaction not found.");

        await command.execute(interaction);
    }

    return {
        getSlashCommand,
        getTextCommand,
        handleCommand,
        getInteractions,
        handleInteraction
    }
}