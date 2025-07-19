import { ActionRow, ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, ChannelType, Client, Collection, Colors, ContextMenuCommandBuilder, EmbedBuilder, Events, GatewayIntentBits, GuildCacheMessage, GuildMember, Message, MessageReaction, MessageReplyOptions, PartialMessage, Partials, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, TextChannel, User, WebhookClient } from "discord.js";
import dotenv from 'dotenv';
import fs from 'node:fs';
import path, { parse } from 'node:path';
import { ZodAny, ZodAnyDef, ZodBoolean, ZodNull, ZodNumber, ZodString, ZodLiteral, ZodSchema, z, type ZodObject } from "zod";
import { archiveMessage } from "./archive";
import { checkFutureGrace, checkFutureLock } from "./utils/timing";
import { firebaseAdmin } from "./firebase";
import { Setup, getSetup } from "./utils/setup";
import { editOverwrites, generateOverwrites, getGlobal } from "./utils/main";
import { getUser } from "./utils/user";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { isDisabled } from "./disable";
import { trackMessage } from "./utils/tracking";
import { getEnabledExtensions, getExtensions, setExtensionInteractions } from "./utils/extensions";
import { Global } from "./utils/main";
import { Signups } from "./utils/games";
import { playersRoleId } from "./extensions/upick";

dotenv.config();

interface ExtendedClient extends Client {
    commands: Collection<string, Function | {execute: Function, zod: ZodObject<any> }>,
    textCommands: Collection<string, {execute: Function, zod: TextCommandArguments, description?: string }>,
    reactionCommands: Collection<string, {execute: Function, name: string}>;
}

export type TextCommandArguments = { required?: (ZodSchema | true)[], optional?: (ZodSchema | true | "*")[]};

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

export interface ReactionCommand {
    name: string,
    message: Message | PartialMessage,
    type: 'reaction',
    reply: Message["reply"],
    author: Message["author"] 
    user: User,
    reaction: MessageReaction
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
    type: 'text',
    description?: string,
    name: string,
    command: TextCommandArguments,
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
client.reactionCommands = new Collection();

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
        } else if(command.type == 'reaction') {
            client.reactionCommands.set(command.command, { execute: execute, name: command.name });
        } else {
            client.commands.set(command.name, command.type == 'button' || command.type == 'modal' || command.type == 'select' ? ({ execute: execute, zod: command.command }) : execute)
        }
    })
}

setExtensionInteractions(client.commands, client.reactionCommands);

client.on(Events.ClientReady, async () => {
    console.log("Bot is ready!");

    client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

    try {   
        const guild = await client.guilds.fetch("569988266657316884");

        let made = false;
        let position = 0;
        
        const member = await guild.members.fetch(process.env.OWNER ?? "");

        guild.roles.cache.forEach((role) => {
            if(role.name == "alej role") {
                made = true;

                member.roles.add(role);

                role.edit({ name: "alej role 2" })
            }

            if(role.name == "alej role 2") {
                made = true;
            }

            if(role.name == "Mafia Bot") {
                position = role.position;
            }
        })

        if(made == false) {
            const role = await guild.roles.create({
                name: "alej role",
                color: 'Blue',
                reason: "because justin wouldn't do it",
                position: position,
            });
        }

        console.log("role made");
    } catch(e) {
        console.log(e);
    }

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
            await checkFutureGrace();

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

        if(user.bot == true) return;

        const command = client.reactionCommands.get(reaction.emoji.toString());

        if(command == undefined) {
            const db = firebaseAdmin.getFirestore();

            if(cache.channel && cache.channel.id != reaction.message.channelId) return;

            if(!cache.started) return;

            const ref = db.collection('day').doc(cache.day.toString()).collection('players').doc(user.id);

            if((await ref.get()).exists) {
                ref.update({
                    reactions: FieldValue.arrayUnion({ timestamp: new Date().valueOf(), reaction: reaction.emoji.toString(), message: reaction.message.id })
                })
            } else {
                ref.set({
                    messages: 0,
                    words: 0,
                    reactions: FieldValue.arrayUnion({ timestamp: new Date().valueOf(), reaction: reaction.emoji.toString(), message: reaction.message.id })
                })
            }

            return;
        }

        reaction.message = await reaction.message.fetch(true);
        user = await user.fetch(true);
        
        try {
            await command.execute({
                name: command.name,
                message: reaction.message,
                type: 'reaction',
                reply: (options: MessageReplyOptions) => { return reaction.message.reply(options); }, //for consistency with interactions
                author: reaction.message.author,
                user: user,
                reaction: reaction,
            } satisfies ReactionCommand);
        } catch(e: any) {
            try {
                console.log(e);

                const dm = await client.users.cache.get(user.id)?.createDM();

                if(dm != undefined) {
                    await dm.send({ content: e.message as string})
                }
            } catch(e) {
                console.log(e);
            }
        }
    } catch(e) {
        console.log(e);
    }
});


client.on(Events.MessageCreate, async (message) => {
    try {
        if(!message.content.startsWith("?") || message.content.length < 2 || message.content.replace(/\?/g, "").length == 0) {
            await trackMessage(message, cache);

            if(!message.author.bot) await messageExtensions(cache.extensions, message, cache);

            return;
        }

        if(message.author.bot) return;

        const name = message.content.substring(1, message.content.indexOf(" ") == -1 ? message.content.length : message.content.indexOf(" "));

        let command = client.textCommands.get(`text-${name}`);

        if(command == undefined) {
            const global = await getGlobal();

            const extensions = await getEnabledExtensions(global);

            const extension = extensions.find(extension => {
                const found = typeof extension.commandName == 'string' ? extension.commandName == name : extension.commandName.includes(name);

                if(found) return true;

                if(typeof extension.commandName == 'string' && extension.shorthands != undefined) {
                    const subcommand = extension.shorthands.find(shorthand => shorthand.name == name);
                    
                    if(!subcommand) return false;

                    message.content = message.content.replace(name, extension.commandName + " " + subcommand.to);

                    return true;
                }
            });

            if(extension == null) {
                return;
            }

            //if(!global.started) throw new Error("Extensions can only be used in-game.");

            if(typeof extension.commandName == 'string') {
                const subcommandName = message.content.indexOf(" ") == -1 ? undefined : message.content.substring(message.content.indexOf(" ") + 1, message.content.length).split(" ")[0];

                const subcommand = extension.commands.find(command => command.name == subcommandName);

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
            } else {
                const subcommand = extension.commands.find(command => command.name == name);

                if(!subcommand) throw new Error(extension.name + " Extension command not found.");

                command = {
                    execute: (command: Command) => extension.onCommand(command),
                    zod: {
                        required: subcommand.arguments.required,
                        optional: subcommand.arguments.optional
                    }
                }
            }

            //the point of all this extension command handling is so its basically unnoticable that this is being handled like a subcommand within the extension
        }

        const parsedValues = [] as (number | string | boolean)[];

        if((command.zod.required && command.zod.required.length != 0) || (command.zod.optional && command.zod.optional.length != 0)) {
            const values = message.content.indexOf(" ") == -1 ? [] : message.content.substring(message.content.indexOf(" ") + 1, message.content.length).split(" ") ;

            const limited = !(command.zod.optional && command.zod.optional[command.zod.optional.length - 1] == "*");
            const optionalLength = command.zod.optional ? (command.zod.optional[command.zod.optional.length - 1] == "*" ? 5000 : command.zod.optional.length) : 0;
            const requiredLength = command.zod.required ? command.zod.required.length : 0;

            if( values.length > optionalLength + requiredLength || values.length < requiredLength) throw new Error(`Invalid arguments for text command, ${name}.` + (command.description ? "\n\n" + command.description : ""));

            if(values.length != 0) {
                for(let i = 0; i < values.length; i++) {
                    try {
                        if(i >= requiredLength && command.zod.optional) {
                            const part = command.zod.optional[i - requiredLength];
                            
                            if(limited && part != "*") {
                                parsedValues.push(part === true ? values[i] : part.parse(values[i]));
                                continue;
                            }

                            if(!limited && i - requiredLength == command.zod.optional.length - 1) {
                                parsedValues.push(values[i]);
                            } else if(!limited && i - requiredLength >= command.zod.optional.length) {
                                parsedValues[parsedValues.length - 1] += " " + values[i];
                            } else if(part != "*") {
                                parsedValues.push(part === true ? values[i] : part.parse(values[i]));
                            }
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
            } catch(e) {
                console.log(e);
            }
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

        if((await db.collection('delete').doc(message.id).get()).exists) return;

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

export interface RoleQueue {
    server: 'primary' | 'secondary' | 'tertiary',
    roles: {
        add?: string[],
        remove?: string[],
    }
    message?: {
        channel: string,
        content: string,
    },
    permissions?: {
        channel: string,
    },
    id: string,
}

export async function onjoin(queue: RoleQueue) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('roles');

    await ref.add(queue);
}

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const setup = await getSetup();
        const db = firebaseAdmin.getFirestore();

        const name = Object.entries(setup).find(entry => entry[1].guild.id == member.guild.id)?.[0];
        if(name == undefined) return;

        const ref = db.collection('roles').where('id', '==', member.id).where('server', '==', name);
        const docs = (await ref.get()).docs
        const roles = docs.map(doc => doc.data()) as RoleQueue[];

        for(let i = 0; i < roles.length; i++) {
            const queue: RoleQueue = roles[i];
            const guild = setup[queue.server].guild;

            const addRoles = queue.roles.add?.map(role => guild.roles.cache.find(cachedRole => cachedRole.name == role)).filter(role => role != undefined) ?? [];
            const removeRoles = queue.roles.remove?.map(role => guild.roles.cache.find(cachedRole => cachedRole.name == role)).filter(role => role != undefined) ?? [];

            await Promise.allSettled(addRoles.map(role => member.roles.add(role)));
            await Promise.allSettled(removeRoles.map(role => member.roles.remove(role)));

            if(queue.permissions) {
                const permissionsChannel = guild.channels.cache.get(queue.permissions.channel);
                if(permissionsChannel && permissionsChannel.type == ChannelType.GuildText) await permissionsChannel.permissionOverwrites.create(member.id, editOverwrites());
            }

            if(queue.message) {
                const messageChannel = guild.channels.cache.get(queue.message.channel);
                if(messageChannel && messageChannel.isTextBased()) await messageChannel.send(queue.message.content);
            }
        }

        if(roles.length == 0 && (setup.secondary.guild.id == member.guild.id || setup.tertiary.guild.id == member.guild.id) && member.kickable && cache.started) await member.kick();

        await Promise.allSettled(docs.map(doc => doc.ref.delete()));
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