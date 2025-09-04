import { Collection, ContextMenuCommandBuilder, Message, MessageReaction, PartialMessage, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, User } from 'discord.js';
import client from './client';
import path from 'node:path';
import fs from 'node:fs';
import { Command } from 'commander';
import { ZodObject } from 'zod';

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
    command: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | Function,
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
});

export async function initCommands() {
    client.commands = new Collection();

    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if (!('data' in command && 'execute' in command)) {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);

            continue;
        }

        const data: Data[] = command.data;
        const execute = command.execute as Function;

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
                default:
                    console.log("not a real command?", command);
            }
        })
    }
}
