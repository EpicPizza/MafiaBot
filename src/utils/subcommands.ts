import { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, Interaction, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, StringSelectMenuInteraction } from "discord.js";
import type { Data, TextCommand } from '../discord';
import { unknown, ZodObject } from "zod";
import { Command } from "commander";
import path from 'node:path';
import fs from 'node:fs';
import { getSetup } from "./setup";
import { getGlobal } from "./global";
import { checkMod } from "./mod";

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

        let command: Subcommand | undefined;

        if(interaction.type == 'text') {
            const subcommand = interaction.program.commands.find(command => command.name() == name || command.aliases().includes(name));

            if(subcommand == undefined) return await interaction.reply("Subcommand not found. [of parser]");

            interaction.program = subcommand;

            command = commands.find(command => command.name == subcommand.name());
        } else {
            command = commands.find(command => command.name == name);
        }

        if(command == undefined) return await interaction.reply("Subcommand not found.");

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

export function subcommandHandler(builder: ReturnType<typeof subcommandBuilder>, autocomplete: (interaction: AutocompleteInteraction) => unknown, mod: boolean = false) {
    return {
        data: [
            builder.getSlashCommand(),
            builder.getTextCommand(),
            ...builder.getInteractions()
        ] satisfies Data[],
    
        execute: async (interaction: Interaction | TextCommand) => {
            if(interaction.type != 'text' && interaction.isAutocomplete()) {
                await autocomplete(interaction);

                return;
            } 
    
            const setup  = await getSetup();
            const global = await getGlobal();
            if(typeof setup == 'string') throw new Error("Setup Incomplete");
    
            if(mod) await checkMod(setup, global, interaction.user.id, 'message' in interaction ? interaction.message?.guild?.id ?? "" : interaction.guildId ?? "");
    
            if(interaction.type == 'text' || interaction.isChatInputCommand()) {
                await builder.handleCommand(interaction)
            } else if(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
                await builder.handleInteraction(interaction);
            }
        }
    };
}