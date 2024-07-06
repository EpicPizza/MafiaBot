import { ActionRow, ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, ChannelType, Client, Collection, Colors, ContextMenuCommandBuilder, EmbedBuilder, Events, GatewayIntentBits, GuildCacheMessage, Message, MessageReplyOptions, Partials, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, TextChannel, WebhookClient } from "discord.js";
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { ZodAny, ZodAnyDef, ZodBoolean, ZodNull, ZodNumber, ZodString, ZodLiteral, ZodSchema, z, type ZodObject } from "zod";
import { archiveMessage } from "./archive";
import { checkFutureLock } from "./utils/timing";
import { firebaseAdmin } from "./firebase";
import { Setup, getSetup } from "./utils/setup";
import { editOverwrites, generateOverwrites, getGlobal } from "./utils/main";
import { getUser } from "./utils/user";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { isDisabled } from "./disable";
import { trackMessage } from "./utils/tracking";
import { getEnabledExtensions, getExtensions } from "./utils/extensions";
import { Global } from "./utils/main";
import { Signups } from "./utils/games";

dotenv.config();

interface ExtendedClient extends Client {
    commands: Collection<string, Function | {execute: Function, zod: ZodObject<any> }>,
    textCommands: Collection<string, {execute: Function, zod: TextCommandArguments, description?: string }>,
}

export type TextCommandArguments = { required?: (ZodSchema | true)[], optional?: (ZodSchema | true)[]};

export interface Command {
    name: string,
    arguments: (string | number | boolean)[],
    message: Message,
    type: 'text',
    reply: Message["reply"],
    user: Message["author"],
}

export interface CommandOptions {
    name: string,
    arguments: TextCommandArguments
}

export interface Cache {
    day: number,
    started: boolean,
    channel: null | TextChannel,
    extensions: string[]
}

const cache: Cache = {
    day: 0,
    started: false,
    channel: null,
    extensions: [],
} satisfies Cache

export type Data = ({
    type: 'button',
    name: string,
    command: ZodObject<any>,
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
    type: 'text',
    description?: string,
    name: string,
    command: TextCommandArguments,
});

const CustomId = z.object({
    name: z.string(),
})

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
        Partials.Channel, 
        Partials.Reaction
    ],
}) as ExtendedClient;

client.commands = new Collection();
client.textCommands = new Collection();

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

    data.forEach((command) => {
        if(command.type == 'text') {
            client.textCommands.set(command.name, { execute: execute, zod: command.command, description: command.description })
        } else {
            client.commands.set(command.name, command.type == 'button' || command.type == 'modal' || command.type == 'select' ? ({ execute: execute, zod: command.command }) : execute)
        }
    })
}

client.on(Events.ClientReady, async () => {
    console.log("Bot is ready!");

    client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

    try {
        const global = await getGlobal();
        
        const setup = await getSetup();

        if(typeof setup == 'string') return;

        cache.channel = setup.primary.chat;
        cache.day = global.day;   
        cache.started = global.started;
        cache.extensions = global.extensions;
    } catch(e) {
        console.log(e);
    }

    setInterval(async () => {
        try {
            await checkFutureLock();

            client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

            const global = await getGlobal();
        
            const setup = await getSetup();

            if(typeof setup == 'string') return;

            cache.channel = setup.primary.chat;
            cache.day = global.day;   
            cache.started = global.started;
            cache.extensions = global.extensions;
        } catch(e) {
            console.log(e);
        }
    }, 1000 * 15)
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
        if(!cache.started) return;

        console.log(newMessage.content);

        if(newMessage.author && newMessage.author.bot == true) return;
        if(cache.channel && newMessage.channelId != cache.channel.id) return;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('edits').doc(newMessage.id);

        if(cache.channel && cache.channel.id != oldMessage.channelId) return;

        if((await ref.get()).exists) {
            await ref.update({
                edits: FieldValue.arrayUnion({
                    content: newMessage.content ?? "No Content",
                    timestamp: newMessage.editedTimestamp ?? new Date().valueOf()
                }),
            })
        } else {
            await ref.set({
                edits: [{
                    content: oldMessage.content ?? "No Content",
                    timestamp: oldMessage.editedTimestamp ?? new Date().valueOf()
                },{
                    content: newMessage.content ?? "No Content",
                    timestamp: newMessage.editedTimestamp ?? new Date().valueOf()
                }],
            })
        }
    } catch(e) {
        console.log(e);
    }
})

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
        if (reaction.partial) {
            reaction = await reaction.fetch();
        }

        const db = firebaseAdmin.getFirestore();

        if(user.bot == true) return;
        
        if(cache.channel && cache.channel.id != reaction.message.channelId) return;

        if(!cache.started) return;

        const ref = db.collection('day').doc(cache.day.toString()).collection('players').doc(user.id);

        if((await ref.get()).exists) {
            ref.update({
                reactions: FieldValue.arrayUnion({ timestamp: new Date().valueOf(), reaction: reaction.emoji.toString() })
            })
        } else {
            ref.set({
                messages: 0,
                words: 0,
                reactions: FieldValue.arrayUnion({ timestamp: new Date().valueOf(), reaction: reaction.emoji.toString() })
            })
        }
    } catch(e) {
        console.log(e);
    }
})

client.on(Events.MessageCreate, async (message) => {
    try {
        if(!message.content.startsWith("?") || message.content.length < 2 || message.content.replace(/\?/g, "").length == 0) {
            await trackMessage(message, cache);

            if(cache.started && !message.author.bot) await messageExtensions(cache.extensions, message, cache);

            return;
        }

        const name = message.content.substring(1, message.content.indexOf(" ") == -1 ? message.content.length : message.content.indexOf(" "));

        let command = client.textCommands.get(`text-${name}`);

        if(command == undefined) {
            const global = await getGlobal();

            const extensions = await getEnabledExtensions(global);

            const extension = extensions.find(extension => extension.commandName == name);

            if(extension == null) {
                return;
            }

            //if(!global.started) throw new Error("Extensions can only be used in-game.");

            const subcommandName = message.content.indexOf(" ") == -1 ? undefined : message.content.substring(message.content.indexOf(" ") + 1, message.content.length).split(" ")[0];

            const subcommand = extension.commands.find(command => command.name == subcommandName)

            if(!subcommand) throw new Error(extension.name + " Extension command not found.");

            command = {
                execute: (command: Command) => {
                    command.name = command.arguments[0] as string;
                    command.arguments = command.arguments.splice(1, command.arguments.length);

                    return extension.onCommand(command);
                },
                zod: {
                    required: subcommand.arguments.required ? [ true, ...subcommand.arguments.required ] : [ true ],
                    optional: subcommand.arguments.optional
                },
            }

            //the point of all this extension command handling is so its basically unnoticable that this is being handled like a subcommand within the extension
        }

        const parsedValues = [] as (number | string | boolean)[];

        if((command.zod.required && command.zod.required.length != 0) || (command.zod.optional && command.zod.optional.length != 0)) {
            const values = message.content.indexOf(" ") == -1 ? [] : message.content.substring(message.content.indexOf(" ") + 1, message.content.length).split(" ") ;

            const optionalLength = command.zod.optional ? command.zod.optional.length : 0;
            const requiredLength = command.zod.required ? command.zod.required.length : 0;

            if(values.length > optionalLength + requiredLength || values.length < requiredLength) throw new Error(`Invalid arguments for text command, ${name}.` + (command.description ? "\n\n" + command.description : ""));

            console.log(values);

            if(values.length != 0) {
                for(let i = 0; i < values.length; i++) {
                    try {
                        if(i >= requiredLength && command.zod.optional) {
                            const part = command.zod.optional[i - requiredLength];
                            parsedValues.push(part === true ? values[i] : part.parse(values[i]));
                        } else if(command.zod.required) {
                            const part = command.zod.required[i];
                            parsedValues.push(part === true ? values[i] : part.parse(values[i]));
                        }
                    } catch(e) {
                        console.log(e);
            
                        throw new Error(`Invalid arguments for text command, ${name}.` + (command.description ? "\n\n" + command.description : ""));
                    }
                }
            }
        }

        try {
            await command.execute({
                name: name,
                arguments: parsedValues,
                message: message,
                type: 'text',
                reply: (options: MessageReplyOptions) => { return message.reply(options); }, //for consistency with interactions
                user: message.author,
            });
        } catch(e: any) {
            try {
                console.log(e);

                await removeReactions(message);

                await message.reply({ content: e.message as string });
            } catch(e) {}
        }
    } catch(e: any) {
        if(message.content.startsWith("?") && message.content.length > 1) {
            message.reply(e.message);
        }

        console.log(e);
    }
})

client.on(Events.MessageDelete, async (message) => {
    try {
        if(!cache.started) return;

        const channel = message.channel;

        if(message.author && message.author.bot == true) return;
        if(cache.channel && message.channelId != cache.channel.id) return;

        const setup = await getSetup();

        if(typeof setup == 'string') return;

        if(channel.id != setup.primary.chat.id) return;

        const db = firebaseAdmin.getFirestore();

        const doc = await db.collection('edits').doc(message.id).get();

        const webhook = await setup.primary.chat.createWebhook({
            name: 'Mafia Bot Snipe',
        });

        if(webhook.token == null) return;

        const client = new WebhookClient({
            id: webhook.id,
            token: webhook.token,
        })

        const result = await archiveMessage(setup.primary.chat, message as any, client);

        client.destroy();

        await webhook.delete();

        if(doc.exists && doc.data()) {
            db.collection('edits').doc(result.id).set(
                doc.data() ?? {}
            )
        }
    } catch(e) {
        console.log(e);
    }
})

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        console.log("STEP 1", member.user.username);

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('invites').orderBy('timestamp', 'desc').where('id', '==', member.id);

        const docs = (await ref.get()).docs;

        if(docs.length < 1) return;

        const data = docs[0].data();
        const second = docs.length > 1 ? docs[1].data() : undefined;

        if(!data) return;

        console.log("STEP 2", data);

        const setup = await getSetup();

        if(typeof setup == 'string') return;

        const user = await getUser(member.id);

        if(!user) return;

        console.log("STEP 3", user.nickname);

        switch(data.type) {
            case 'joining':
                console.log("STEP 4", data.type);

                const global = await getGlobal();

                if(!global.started) return;

                if(setup.secondary.guild.id != member.guild.id) return;

                console.log("STEP 5", user.channel);
                
                if(user.channel != null) {
                    const channel = await setup.secondary.guild.channels.fetch(user.channel).catch(() => null);

                    if(channel == null) {
                        const channel = await setup.secondary.guild.channels.create({ 
                            name: user.nickname.toLowerCase(),
                        });
                
                        await channel.setParent(setup.secondary.dms.id);

                        await channel.permissionOverwrites.create(user.id, editOverwrites());
        
                        await db.collection('users').doc(user.id).update({
                            channel: channel.id,
                        });

                        await channel.send("Welcome <@" + user.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod.");
                    } else {
                        await (channel as TextChannel).permissionOverwrites.create(user.id, editOverwrites());

                        await (channel as TextChannel).send("Welcome <@" + user.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod.");
                    }
                } else {
                    const channel = await setup.secondary.guild.channels.create({ 
                        parent: setup.secondary.dms, 
                        name: user.nickname.toLowerCase(),
                        permissionOverwrites: generateOverwrites(user.id)
                    });

                    await db.collection('users').doc(user.id).update({
                        channel: channel.id,
                    });

                    await channel.send("Welcome <@" + user.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod.");
                }
                break;
            case "spectate":
                if(second && second.type == "dead-spectate" && setup.secondary.guild.id == member.guild.id) {
                    await member.roles.add(setup.secondary.spec);
                    await member.roles.remove(setup.secondary.access);
                }

                if(setup.tertiary.guild.id != member.guild.id) return;

                await member.roles.add(setup.tertiary.spec);
                break;
            case "mafia":
                if(setup.tertiary.guild.id != member.guild.id) return;

                await member.roles.add(setup.tertiary.access);
                break;
            case "mafia-mod":
                if(second && second.type == "dead-mod" && setup.secondary.guild.id == member.guild.id) {
                    await member.roles.add(setup.secondary.mod);
                    await member.roles.add(setup.secondary.spec);
                    await member.roles.remove(setup.secondary.access);
                }

                if(setup.tertiary.guild.id != member.guild.id) return;

                await member.roles.add(setup.tertiary.mod);
                await member.roles.add(setup.tertiary.spec);
                break;
            case "dead-mod":
                if(setup.secondary.guild.id != member.guild.id) return;

                await member.roles.add(setup.secondary.mod);
                await member.roles.add(setup.secondary.spec);
                await member.roles.remove(setup.secondary.access);
                break;
            case "dead-spectate":
                if(setup.secondary.guild.id != member.guild.id) return;

                await member.roles.add(setup.secondary.spec);
                await member.roles.remove(setup.secondary.access);
                break;
            default:
                if(setup.secondary.guild.id == member.guild.id || setup.tertiary.guild.id == member.guild.id) {
                    if(member.kickable && cache.started) {
                        await member.kick();
                    }
                }
        }
    } catch(e) {
        console.log(e);
    }
})

client.on(Events.InteractionCreate, async interaction => {
    if(interaction.isButton()) {
        let name: string;

        try {
            const command = CustomId.parse(JSON.parse(interaction.customId));

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
        } catch(e: any) {
            try {
                console.log(e);

                if(interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch(e) {} //trying to pickup commands from any point is kinda weird, so i put try catch just in case
        }
    } else if(interaction.isModalSubmit()) {
        let name: string;

        try {
            const command = CustomId.parse(JSON.parse(interaction.customId));

            name = command.name;
        } catch(e) {
            console.log(e);

            await interaction.reply({ content: "An error occurred while processing modal submit.", ephemeral: true})

            return;
        }

        const command = client.commands.get(`modal-${name}`);

        if(command == undefined || typeof command != 'object') {
            await interaction.reply({ content: "Modal handler not found.", ephemeral: true });

            return;
        }

        try {
            command.zod.parse(JSON.parse(interaction.customId));
        } catch(e) {
            console.log(e);

            interaction.reply({ content: `An error occurred while processing modal submit, ${name}.`, ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch(e: any) {
            try {
                console.log(e);

                if(interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch(e) {}
        }
    } else if(interaction.isStringSelectMenu()) {
        let name: string;

        try {
            const command = CustomId.parse(JSON.parse(interaction.customId));

            name = command.name;
        } catch(e) {
            console.log(e);

            await interaction.reply({ content: "An error occurred while processing select menu submit.", ephemeral: true})

            return;
        }

        const command = client.commands.get(`select-${name}`);

        if(command == undefined || typeof command != 'object') {
            await interaction.reply({ content: "Select menu handler not found.", ephemeral: true });

            return;
        }

        try {
            command.zod.parse(JSON.parse(interaction.customId));
        } catch(e) {
            console.log(e);

            interaction.reply({ content: `An error occurred while processing select menu submit, ${name}.`, ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch(e: any) {
            try {
                console.log(e);

                if(interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch(e) {}
        }
    } else if(interaction.isChatInputCommand()) {
        const command = client.commands.get(`slash-${interaction.commandName}`);

        if(command == undefined || typeof command == 'object') {
            await interaction.reply({ content: "Slash command not found.", ephemeral: true });

            return;
        }

        try {
            await command(interaction);
        } catch(e: any) {
            try {
                console.log(e);

                if(interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch(e) {}
        }
    } else if(interaction.isContextMenuCommand()) {
        const command = client.commands.get(`context-${interaction.commandName}`);

        if(command == undefined || typeof command == 'object') {
            await interaction.reply({ content: "Context menu command not found.", ephemeral: true });

            return;
        }

        try {
            await command(interaction);
        } catch(e: any) {
            try {
                console.log(e);

                if(interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch(e) {}
        }
    } else if (interaction.isAutocomplete()) {
		const command = client.commands.get(`slash-${interaction.commandName}`);

		
        if(command == undefined || typeof command == 'object') {
            return;
        }

		try {
            await command(interaction);
        } catch(e: any) {
            try {
                console.log(e);
            } catch(e) {}
        }
	} else {
        if(interaction.isRepliable()) {
            await interaction.reply({ content: "Command not found.", ephemeral: true })
        }
    } 
});

if(!isDisabled()) {
    client.login(process.env.DEV == "TRUE" ? process.env.DEVTOKEN : process.env.TOKEN);
}

export default client;

export async function removeReactions(message: Message) {
    const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(client.user?.id ?? ""));

    try {
        for (const reaction of userReactions.values()) {
            await reaction.users.remove(client.user?.id ?? "");
        }
    } catch (error) {
        console.error('Failed to remove reactions.');
    }
}

export async function messageExtensions(extensionNames: string[], message: Message, cache: Cache) {
    const extensions = getExtensions(extensionNames);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onMessage(message, cache)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}