import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import { Command } from "commander";
import { ZodObject } from "zod";
import dotenv from 'dotenv';

dotenv.config();

const client: ExtendedClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildPresences
    ],
    partials: [
        Partials.Message,
        Partials.Channel, 
        Partials.Reaction,
        Partials.GuildMember
    ],
}) as ExtendedClient;

export interface ExtendedClient extends Client {
    commands: Collection<string, 
        { execute: Function, type: 'command' } | 
        { execute: Function, zod: ZodObject<any>, type: 'customId' } | 
        { execute: Function, command: () => Command, type: 'text' } | 
        { execute: Function, name: string, type: 'reaction' }
    >,
    help: Collection<string,
        { 
            name: string,
            shorthand: string,
            slash?: string,
            text?: string,
            description: string,
            arguments: { name: string, description: string, type: 'slash' | 'text' }[],
        }
    >
}

export default client;