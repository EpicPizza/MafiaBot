import { Command } from 'commander';
import { AnySelectMenuInteraction, ButtonInteraction, Message, ModalSubmitInteraction } from 'discord.js';
import type { Transaction } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import type { ZodObject } from 'zod';
import type { Event, ReactionCommand } from '../discord';
import type { TextCommand } from '../discord';
import type { ExtendedClient } from '../discord/client';
import type { GameContext } from './mafia/context';
import { findRunningGame } from './mafia/context';
import type { Signups } from './mafia/games';
import type { User } from './mafia/user';
import type { TransactionResult } from './mafia/vote';
import type { Setup } from './setup';
import { initHelp } from '../discord/help';
import { Instance } from './instance';
import { firebaseAdmin } from './firebase';
import { MessageAction, ReactionAction, StatsAction } from './mafia/tracking';

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
    interaction: Event<ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction | ReactionCommand>,
} | {
    name: string,
    interaction: Event<ReactionCommand>,
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
    onStart: { (ctx: GameContext): Promise<unknown> },
    onLock: { (ctx: GameContext): Promise<unknown> },
    onUnlock: { (ctx: GameContext, incremented: boolean): Promise<unknown> },
    onCommand: { (command: Event<TextCommand>): Promise<unknown> },
    onMessage: { (message: Message): Promise<unknown> },
    onEnd: { (ctx: GameContext): Promise<unknown> },
    onVote: { (ctx: GameContext, voter: User, voting: User | undefined, type: 'vote' | 'unvote', users: User[], transaction: Transaction): Promise<TransactionResult> | Promise<void> },
    onVotes: { (ctx: GameContext, board: string ): string | Promise<string> },
    onHammer: { (ctx: GameContext, hammered: string): Promise<unknown> },
    onRemove: { (ctx: GameContext, removed: string): Promise<unknown> },
    onSignup?: { (instance: Instance, game: Signups, id: string): Promise<unknown> },
    onLeave?: { (instance: Instance, game: Signups, id: string): Promise<unknown> },
    onDump: { (statsBatch: StatsAction[], messageBatch: MessageAction[], reactionBatch: ReactionAction[]): Promise<unknown> }
}

export function getEnabledExtensions(ctx: GameContext) {
    return getExtensions(ctx.state.extensions);
}

// Enabled in the game this channel belongs to (or the only running game), otherwise in any active game (pregame
// commands like upick, or several games running and the channel picks none).
async function isExtensionInUse(name: string, instance: Instance, channelId: string | null) {
    const running = await findRunningGame(instance, channelId, true);

    if(running) return running.state.extensions.includes(name);

    const games = await firebaseAdmin.getFirestore().collection('instances').doc(instance.id).collection('games').where('state', '==', 'active').get();

    return games.docs.some(game => ((game.data().extensions ?? []) as string[]).includes(name));
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
            execute: async (interaction: Event<TextCommand>) => {
                interaction.inInstance();

                const global = interaction.inInstance();

                if(!(await isExtensionInUse(extension.name, interaction.instance, interaction.message.channelId))) throw new Error("Extension not enabled!");

                const name = interaction.program.args[0] as string;

                const command = interaction.program.commands.find(command => command.name() == name || command.aliases().includes(name));

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

        initHelp([{
            type: command.type,
            description: undefined,
            name: command.name,
            command: command.command,
        }]);
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
                    execute: async (reaction: Event<ReactionCommand>) => {
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
                    execute: async (interaction: Event<ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction>) => {
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