import { Command } from 'commander';
import { AnySelectMenuInteraction, ButtonInteraction, Message, ModalSubmitInteraction } from 'discord.js';
import type { Transaction } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import type { ZodObject } from 'zod';
import type { Cache } from '../discord/message';
import type { ReactionCommand } from '../discord';
import type { TextCommand } from '../discord';
import type { ExtendedClient } from '../discord/client';
import { getGlobal, type Global } from './global';
import type { Signups } from './mafia/games';
import type { User } from './mafia/user';
import type { TransactionResult } from './mafia/vote';
import type { Setup } from './setup';

const extensions = [] as Extension[]; 
const extensionsPath = path.join(__dirname, '../extensions');
const extensionFiles = fs.readdirSync(extensionsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for(const file of extensionFiles) {
    const filePath = path.join(extensionsPath, file);
    const extension = require(filePath);

    if(extension.name != "Example") extensions.push(extension);
}

export type ExtensionInteractions = {
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
}

export type ExtensionInteraction = {
    customId: any,
    name: string,
    interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction | ReactionCommand,
} | {
    name: string,
    interaction: ReactionCommand,
}

export interface Extension {
    name: string,
    commandName: string,
    shorthands?: { name: string, to: string }[],
    emoji: string,
    description: string,
    priority: string[],
    help: string,
    commands: (() => Command)[],
    interactions: ExtensionInteractions[],
    onInteraction: (extensionInteraction: ExtensionInteraction) => Promise<unknown>,
    onStart: { (global: Global, setup: Setup, game: Signups): Promise<unknown> },
    onLock: { (global: Global, setup: Setup, game: Signups): Promise<unknown> },
    onUnlock: { (global: Global, setup: Setup, game: Signups, incremented: boolean): Promise<unknown> },
    onCommand: { (command: TextCommand): Promise<unknown> },
    onMessage: { (message: Message, cache: Cache): Promise<unknown> },
    onEnd: { (global: Global, setup: Setup, game: Signups): Promise<unknown> },
    onVote: { (global: Global, setup: Setup, game: Signups, voter: User, voting: User | undefined, type: 'vote' | 'unvote', users: User[], transaction: Transaction): Promise<TransactionResult> | Promise<void> },
    onVotes: { (global: Global, setup: Setup, game: Signups, board: string ): string | Promise<string> },
    onHammer: { (global: Global, setup: Setup, game: Signups, hammered: string): Promise<unknown> },
    onRemove: { (global: Global, setup: Setup, game: Signups, removed: string): Promise<unknown> },
}

export async function getEnabledExtensions(global: Global) {
    return extensions.filter(extension => global.extensions.find(enabled => enabled == extension.name));
}

export function getAllExtensions() {
    return extensions;
}

export function getExtensions(extensionNames: string[]) {
    return extensions.filter(extension => extensionNames.find(enabled => enabled == extension.name));
}

export function getExtensionTextCommands() {
    return extensions.map(extension => {
        return {
            type: "text" as "text",
            name: "text-" + extension.commandName,
            command: () => {
                const group = new Command()
                    .name(extension.commandName)
                    .description(extension.description)
                    
                extension.commands.forEach(command => {
                    const subcommand = command();

                    subcommand.exitOverride();

                    group.addCommand(subcommand);
                });

                return group;
            },
            execute: async (interaction: TextCommand) => {
                const global = await getGlobal();

                const enabledExtensions = await getEnabledExtensions(global);

                if(!enabledExtensions.map(extension => extension.name).includes(extension.name)) throw new Error("Extension not enabled!");

                const name = interaction.program.args[0] as string;

                const command = interaction.program.commands.find(command => command.name() == name);

                if(command == undefined) return await interaction.reply("Subcommand not found.");

                interaction.program = command;
                interaction.name = command.name();

                await extension.onCommand(interaction);
            }
        }
    });
}

export function setExtensionTextCommands(commands: ExtendedClient["commands"]) {
    const extensionCommands = getExtensionTextCommands();

    extensionCommands.forEach(command => {
        commands.set(command.name, command);
    });
}

export function setExtensionInteractions(commands: ExtendedClient["commands"]) { 
    for(let i = 0; i < extensions.length; i++) {
        const extension = extensions[i];

        for(let j = 0; j < extension.interactions.length; j++) {
            const extensionInteraction = extension.interactions[j];

            if(extensionInteraction.type == 'reaction') {
                commands.set(extensionInteraction.command, {
                    name: extensionInteraction.name,
                    execute: async (reaction: ReactionCommand) => {
                        await extension.onInteraction({
                            name: extensionInteraction.name,
                            interaction: reaction,
                        })
                    },
                    type: 'reaction'
                });
            } else {
                commands.set(extensionInteraction.name, {
                    zod: extensionInteraction.command,
                    execute: async (interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction) => {
                        await extension.onInteraction({
                            name: extensionInteraction.name,
                            customId: JSON.parse(interaction.customId),
                            interaction: interaction,
                        });
                    },
                    type: 'customId'
                });
            }
        }
    }
}