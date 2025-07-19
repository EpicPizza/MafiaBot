import fs from 'node:fs';
import path from 'node:path';
import { CommandOptions, ReactionCommand } from '../discord';
import { ZodObject } from 'zod';
import { AnySelectMenuInteraction, ButtonInteraction, Collection, ModalSubmitInteraction } from 'discord.js';
import { Setup } from './setup';
import { Signups } from './games';
import { Global } from './main';

const extensionsPath = path.join(__dirname, '../extensions');
const extensionFiles = fs.readdirSync(extensionsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
export const extensions = [] as Extension[]; 

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
    commandName: string | string[],
    shorthands?: { name: string, to: string }[],
    emoji: string,
    description: string,
    priority: string[],
    help: string,
    commands: CommandOptions[],
    interactions: ExtensionInteractions[],
    onInteraction: (extensionInteraction: ExtensionInteraction) => Promise<void>,
    onStart: Function,
    onLock: Function,
    onUnlock: Function,
    onCommand: Function,
    onMessage: Function,
    onEnd: Function,
    onVote: Function,
    onVotes: { (global: Global, setup: Setup, game: Signups, board: string ): string | Promise<string> },
    onHammer: Function,
    onRemove: Function,
}

for(const file of extensionFiles) {
    const filePath = path.join(extensionsPath, file);
    const extension = require(filePath);

    if(extension.name != "Example") extensions.push(extension);
}

export async function getEnabledExtensions(global: Global) {
    return extensions.filter(extension => global.extensions.find(enabled => enabled == extension.name));
}

export function getExtensions(extensionNames: string[]) {
    return extensions.filter(extension => extensionNames.find(enabled => enabled == extension.name));
}

export function setExtensionInteractions(commands: Collection<string, Function | {execute: Function, zod: ZodObject<any> }>,
    reactionCommands: Collection<string, {execute: Function, name: string}>) {
    
    console.log("EXTENSIONS", extensions.length);

    for(let i = 0; i < extensions.length; i++) {
        const extension = extensions[i];

        for(let j = 0; j < extension.interactions.length; j++) {
            const extensionInteraction = extension.interactions[j];

            if(extensionInteraction.type == 'reaction') {
                reactionCommands.set(extensionInteraction.command, {
                    name: extensionInteraction.name,
                    execute: async (reaction: ReactionCommand) => {
                        await extension.onInteraction({
                            name: extensionInteraction.name,
                            interaction: reaction,
                        })
                    }
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
                    }
                });
            }
        }
    }
}