import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import { Command } from "commander";
import { ZodObject } from "zod";
import dotenv from 'dotenv';
import { isDisabled } from "../disable";

dotenv.config();

const client: ExtendedClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Message,
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
}

if (!isDisabled()) {
    client.login(process.env.TOKEN);
}

export default client;
