import { AnySelectMenuInteraction, ApplicationCommandOptionType, ButtonInteraction, ChatInputCommandInteraction, Collection, ContextMenuCommandBuilder, ContextMenuCommandInteraction, GuildMember, Interaction, Message, MessageReaction, ModalSubmitInteraction, PartialMessage, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandsOnlyBuilder, User } from 'discord.js';
import { ZodObject } from 'zod';
import { setExtensionInteractions, setExtensionTextCommands } from '../utils/extensions';
import client from './client';
import path from 'node:path';
import fs from 'node:fs';
import { initHelp } from './help';
import { firebaseAdmin } from '../utils/firebase';
import { Instance } from '../utils/instance';
import { Command } from 'commander';

export type Event<T> = T & {
    name: string,

    instance?: Instance,
    inInstance(): asserts this is Event<T> & { instance: Instance },
};

export interface TextCommand {
    type: 'text',
    program: Command,
    message: Message,
    user: User,
    reply: Message['reply']
}

export interface ReactionCommand {
    type: 'reaction'
    message: Message | PartialMessage,
    user: User,
    reaction: MessageReaction,
    reply: Message['reply']
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
});

export async function initCommands() {
    client.commands = new Collection();
    client.help = new Collection();

    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    for (const fileName of commandFiles) {
        const filePath = path.join(commandsPath, fileName);
        const command = require(filePath);

        if(!('data' in command && 'execute' in command)) {
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
            }
        });

        initHelp(data);
    }

    setExtensionInteractions(client.commands);
    setExtensionTextCommands(client.commands);

    firebaseAdmin.getFirestore().settings({ ignoreUndefinedProperties: true });
    await firebaseAdmin.getFirestore().collection('commands').doc('help').set({ entries: Object.fromEntries(client.help) });
}