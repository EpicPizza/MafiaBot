import { ChannelType, Client, Collection, Events, GatewayIntentBits, Message, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, WebhookClient } from "discord.js";
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { z, type ZodObject } from "zod";
import { archiveMessage } from "./archive";

dotenv.config();

interface ExtendedClient extends Client {
    commands: Collection<string, Function | {execute: Function, zod: ZodObject<any>}>,
}

export type Data = ({
    type: 'button',
    name: string,
    command: ZodObject<any>,
} | {
    type: 'slash',
    name: string,
    command: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder,
});

const Button = z.object({
    name: z.string(),
})

const client: ExtendedClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ]
}) as ExtendedClient;

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for(const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!('data' in command && 'execute' in command)) {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);

        continue;
	}

    const data: Data[] = command.data;
    const execute = command.execute as Function;

    data.forEach((command) => client.commands.set(command.name, command.type == 'button' ? ({ execute: execute, zod: command.command }) : execute))
}

client.on(Events.ClientReady, () => {
    console.log("Bot is ready!");
})

client.on(Events.MessageDelete, async (message) => {
    console.log("CAUGHT");

    const channel = message.channel;

    if(message.author && message.author.bot == true) return;

    if(channel.type != ChannelType.GuildText) return;

    const webhook = await channel.createWebhook({
        name: 'Mafia Bot Snipe',
    });

    const client = new WebhookClient({
        id: webhook.id,
        token: webhook.token,
    })

    await archiveMessage(channel, message as any, client);

    client.destroy();

    await webhook.delete();
})

client.on(Events.InteractionCreate, async interaction => {
    if(interaction.isButton()) {
        let name: string;

        try {
            const command = Button.parse(JSON.parse(interaction.customId));

            name = command.name;
        } catch(e) {
            console.log(e);

            await interaction.reply({ content: "An error occurred while processing button command.", ephemeral: true})

            return;
        }

        const command = client.commands.get(`button-${name}`);

        if(command == undefined || typeof command != 'object') {
            await interaction.reply({ content: "Button command not found.", ephemeral: true });

            return;
        }

        try {
            command.zod.parse(JSON.parse(interaction.customId));
        } catch(e) {
            console.log(e);

            interaction.reply({ content: `An error occurred while processing button command, ${name}.`, ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch(e) {
            console.log(e);
        }
    } else if(interaction.isChatInputCommand()) {
        const command = client.commands.get(`slash-${interaction.commandName}`);

        if(command == undefined || typeof command == 'object') {
            await interaction.reply({ content: "Slash command not found.", ephemeral: true });

            return;
        }

        try {
            await command(interaction);
        } catch(e) {
            console.log(e);
        }
    } else {
        if(interaction.isRepliable()) {
            await interaction.reply({ content: "Command not found.", ephemeral: true })
        }
    }
});

client.login(process.env.DEV == "TRUE" ? process.env.DEVTOKEN : process.env.TOKEN);

export default client;