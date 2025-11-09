import { Command } from 'commander';
import { ApplicationCommandOptionType, Collection, ContextMenuCommandBuilder, Message, MessageReaction, PartialMessage, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, User } from 'discord.js';
import { ZodObject } from 'zod';
import { setExtensionInteractions, setExtensionTextCommands } from '../utils/extensions';
import client from './client';
import path from 'node:path';
import fs from 'node:fs';

export interface TextCommand {
    name: string;
    program: Command;
    message: Message;
    type: 'text';
    reply: Message["reply"];
    user: Message["author"];
}

export interface ReactionCommand {
    name: string;
    message: Message | PartialMessage;
    type: 'reaction';
    reply: Message["reply"];
    author: Message["author"];
    user: User;
    reaction: MessageReaction;
}

export type Data = ({
    type: 'text',
    description?: string,
    name: string,
    command: () => Command,
} | {
    type: 'slash',
    name: string,
    command: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder,
} | {
    type: 'context',
    name: string,
    command: ContextMenuCommandBuilder,
} | {
    type: 'modal',
    name: string,
    command: ZodObject<any>,
} | {
    type: 'select',
    name: string,
    command: ZodObject<any>,
} | {
    type: 'button',
    name: string,
    command: ZodObject<any>,
} | {
    type: 'reaction',
    name: string,
    command: string,
} | {
    type: 'help',
    name: string,
    slash?: string | true,
    text?: string | true,
    description?: string,
});

export async function initCommands() {
    client.commands = new Collection();
    client.help = new Collection();

    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    for (const fileName of commandFiles) {
        const filePath = path.join(commandsPath, fileName);
        const command = require(filePath);

        if (!('data' in command && 'execute' in command)) {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);

            continue;
        }

        const data: Data[] = command.data;
        const execute = command.execute as Function;

        const helpEntries: { type: 'help', name: string, slash?: true, text?: true }[] = [];

        data.forEach((command) => {
            const commandName = command.name.substring(command.name.indexOf("-") + 1) ;

            switch (command.type) {
                case 'text':
                    const existsText = helpEntries.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName);

                    if(existsText == undefined) {
                        helpEntries.push({
                            type: 'help',
                            name: 'help-' + commandName,
                            text: true,
                        })
                    } else {
                        existsText.text = true;
                    }

                    break;
                case 'slash':
                    const existsSlash = helpEntries.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName);

                    if(existsSlash == undefined) {
                        helpEntries.push({
                            type: 'help',
                            name: 'help-' + commandName,
                            slash: true,
                        })
                    } else {
                        existsSlash.slash = true;
                    }

                    break;
            }
        });

        data.push(... helpEntries);

        data.forEach((command) => {
            switch (command.type) {
                case 'text':
                    client.commands.set(command.name, { execute: execute, command: command.command, type: 'text' })
                    break;
                case 'reaction':
                    client.commands.set('reaction-' + command.command, { execute: execute, name: command.name, type: 'reaction' });
                    break;
                case 'slash':
                case 'context':
                    client.commands.set(command.name, { execute: execute, type: 'command' });
                    break;
                case 'button':
                case 'modal':
                case 'select':
                    client.commands.set(command.name, { execute: execute, zod: command.command, type: 'customId' });
                    break;
                case 'help':
                    const commandArguments = [] as { name: string, description: string, type: 'slash' | 'text' }[]; 

                    const commandName = command.name.substring(command.name.indexOf("-") + 1) ;

                    const slashCommand = data.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName && part.type == 'slash');
                    const textCommand = data.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName && part.type == 'text');
                    if(slashCommand && slashCommand.type != 'slash' || textCommand && textCommand.type != 'text') break;

                    if(slashCommand == undefined && textCommand == undefined) break;
                    const description = command.description ? command.description : slashCommand ? slashCommand.command.toJSON().description : textCommand?.description ?? "No description found.";

                    if(textCommand && command.text) {
                        const commandInstance = textCommand.command();
                        const help = commandInstance.helpInformation();

                        const argumentsIndex = help.indexOf('Arguments:');
                        const optionsIndex = help.indexOf('Options:');
                        const commandsIndex = help.indexOf('Commands:');

                        if (argumentsIndex !== -1) {
                            const argumentsSection = help.substring(argumentsIndex, optionsIndex !== -1 ? optionsIndex : commandsIndex !== -1 ? commandsIndex : undefined);
                            const argumentLines = argumentsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                            argumentLines.forEach(line => {
                                const parts = line.trim().split(/\s\s+/);
                                if (parts.length < 2) return;
                                const namePart = parts[0];
                                const description = parts.slice(1).join(' ');
                                
                                const usageLine = help.substring(help.indexOf('Usage:'), help.indexOf('\n'));
                                const isOptional = usageLine.includes(`[${namePart}`);
                                const isRequired = usageLine.includes(`<${namePart}`);
                                const type = isOptional ? "optional" : isRequired ? "required" : "argument";
                                
                                commandArguments.push({ name: namePart, description: description + ` ***(${type})***`, type: 'text' });
                            });
                        }

                        if (optionsIndex !== -1) {
                            const optionsSection = help.substring(optionsIndex, commandsIndex !== -1 ? commandsIndex : undefined);
                            const optionLines = optionsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                            optionLines.forEach(line => {
                                const parts = line.trim().split(/\s\s+/);
                                if (parts.length < 2 || parts[0].includes("help")) return;
                                commandArguments.push({ name: parts[0], description: parts.slice(1).join(' ') + (parts.slice(1).join(' ').includes("** **") ? ' ***(required)***' : ' ***(optional)***'), type: 'text' });
                            });
                        }

                        if (commandsIndex !== -1) {
                            const commandsSection = help.substring(commandsIndex);
                            const commandLines = commandsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                            commandLines.forEach(line => {
                                const parts = line.trim().split(/\s\s+/);
                                if (parts.length < 2) return;
                                const name = parts[0];
                                const description = parts.slice(1).join(' ');
                                commandArguments.push({ name, description: description + "** **", type: 'text' });
                            });
                        }

                        if(command.text === true) {
                            const textArguments = commandArguments
                                .filter(arg => arg.type === 'text' && !arg.description.includes('** **'))
                                .map(argument => (argument.name.indexOf(",") != -1 ? argument.name.substring(argument.name.indexOf(",") + 1) : argument.name).trim())
                                .join(" ");
                            command.text = `?${commandName} ${textArguments}`;
                        }
                    }

                    if(slashCommand && command.slash) {
                        const slashCommandArguments = (slashCommand.command.toJSON().options?.map(option => {
                            const isSubcommand = option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup;
                            const description = option.description + (isSubcommand ? "" : (option.required ? " ***(required)***" : " ***(optional)***"));
                            return { name: option.name, description, type: 'slash' as 'slash', format: option.type };
                        }) ?? []);

                        if(command.name == "help-stats") console.log(slashCommandArguments);

                        if(command.slash === true) command.slash = "/" + commandName + " " + getFormat(slashCommand.command).join(" ");

                        commandArguments.push( ...slashCommandArguments );
                    }

                    client.help.set(command.name, { ...command, arguments: commandArguments, description: description, shorthand: (command.text ? "?" + commandName : "") + (command.slash && command.text ? " • " : "") + (command.slash ? "/" + commandName : ""), slash: command.slash === true ? "Unable to generate sturcture." : command.slash, text: command.text === true ? "Unable to generate sturcture." : command.text });
                    break;
            }
        })
    }

    setExtensionInteractions(client.commands);
    setExtensionTextCommands(client.commands);

    //console.log(client.help);
}

function getFormat(command: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder) {
    const formatted = [] as string[];

    (command.toJSON().options ?? []).forEach(option => {
        switch(option.type) {
            case ApplicationCommandOptionType.String:
                if(option.choices) {
                    formatted.push(option.name + ":{" + option.choices.map(choice => choice.name).join("|") + "}");
                } else {
                    formatted.push(option.name + ":{" + option.name + "}");
                }

                break;
            case ApplicationCommandOptionType.Number:
            case ApplicationCommandOptionType.Integer:
                formatted.push(option.name + ":{number}");
                break;
            case ApplicationCommandOptionType.Boolean:
                formatted.push(option.name + ":{true|false}");
                break;
            case ApplicationCommandOptionType.Channel:
                formatted.push(option.name + ":{channel}");
                break;
            case ApplicationCommandOptionType.Role:
                formatted.push(option.name + ":{role}");
                break;
            case ApplicationCommandOptionType.User:
                formatted.push(option.name + ":{user}");
                break;
            case ApplicationCommandOptionType.Mentionable:
                formatted.push(option.name + ":{mention}");
                break;
            case ApplicationCommandOptionType.Attachment:
                formatted.push(option.name + ":{attachment}");
                break;    
        } 
    });

    return formatted;
}