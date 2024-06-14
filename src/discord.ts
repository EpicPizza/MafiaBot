import { ActionRow, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Collection, Colors, ContextMenuCommandBuilder, EmbedBuilder, Events, GatewayIntentBits, GuildCacheMessage, Message, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, TextChannel, WebhookClient } from "discord.js";
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { z, type ZodObject } from "zod";
import { archiveMessage } from "./archive";
import { checkFutureLock } from "./utils/timing";
import { firebaseAdmin } from "./firebase";
import { getSetup } from "./utils/setup";
import { editOverwrites, generateOverwrites, getGlobal } from "./utils/main";
import { getUser } from "./utils/user";
import { FieldValue } from "firebase-admin/firestore";

dotenv.config();

interface ExtendedClient extends Client {
    commands: Collection<string, Function | {execute: Function, zod: ZodObject<any>}>,
}

const cache = {
    day: 0,
    started: false,
    channel: null as null | string,
    games: [] as { name: string, id: string, url: string }[],
    bulletin: null as Message | null,
    cooldown: 0 as number,
    new: true as boolean,
}

export type Data = ({
    type: 'button',
    name: string,
    command: ZodObject<any>,
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

    data.forEach((command) => client.commands.set(command.name, command.type == 'button' || command.type == 'modal' || command.type == 'select' ? ({ execute: execute, zod: command.command }) : execute))
}

client.on(Events.ClientReady, async () => {
    console.log("Bot is ready!");

    try {
        const global = await getGlobal();
        
        const setup = await getSetup();

        if(typeof setup == 'string') return;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('game').collection('games');

        const docs = (await ref.get()).docs;

        const games = [] as { name: string, id: string, url: string }[];

        for(let doc = 0; doc < docs.length; doc++) {
            const data = docs[doc].data();

            if(!data) continue;

            games.push({
                name: data.name,
                id: docs[doc].id,
                url: "https://discord.com/channels/" + setup.primary.guild.id + "/" + setup.primary.chat.id + "/" + data.message
            })
        };

        const message = await setup.primary.chat.messages.fetch(global.bulletin ?? "").catch(() => null);

        cache.games = games;
        cache.channel = setup.primary.chat.id;
        cache.bulletin = message;
        cache.day = global.day;   
        cache.started = global.started;
    } catch(e) {
        console.log(e);
    }

    setInterval(async () => {
        try {
            await checkFutureLock();

            const global = await getGlobal();
        
            const setup = await getSetup();

            if(typeof setup == 'string') return;

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('settings').doc('game').collection('games');

            const docs = (await ref.get()).docs;

            const games = [] as { name: string, id: string, url: string }[];

            for(let doc = 0; doc < docs.length; doc++) {
                const data = docs[doc].data();

                if(!data || !data.message.id) continue;

                games.push({
                    name: data.name,
                    id: docs[doc].id,
                    url: "https://discord.com/channels/" + setup.primary.guild.id + "/" + setup.primary.chat.id + "/" + data.message.id
                })
            }

            cache.games = games;
            cache.day = global.day;  
            cache.channel = setup.primary.chat.id; 
            cache.started = global.started;

            let resetBulletin = ((new Date()).valueOf() - cache.cooldown) > 1000 * 60 * 2;

            //console.log((new Date()).valueOf(), cache.cooldown);
            //console.log(cache.started, cache.new, resetBulletin);

            if(!cache.started && cache.new && resetBulletin) {
                const ref = db.collection('settings').doc('game');

                if(cache.bulletin) {
                    await cache.bulletin.delete();
                }

                const embed = new EmbedBuilder()
                    .setTitle("Ongoing Games")
                    .setDescription("Welcome to Mafia! Click an ongoing mafia game to go to its signups.")
                    .setColor(Colors.Orange)
                    
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(cache.games.map(game => {
                        return new ButtonBuilder()
                            .setLabel(game.name)
                            .setURL(game.url)
                            .setStyle(ButtonStyle.Link)
                    }));

                cache.bulletin = await setup.primary.chat.send({ embeds: [embed], components: [row] });
                cache.new = false;

                await ref.update({
                    bulletin: cache.bulletin?.id ?? null,
                })
            }
        } catch(e) {
            console.log(e);
        }
    }, 1000 * 15)
});

client.on(Events.MessageCreate, async (message) => {
    try {
        if(message.content == "?test") {
            return await message.reply("Hi, please use slash commands to run this bot.");
        }

        if(message.content == "?check") {
            const setup = await getSetup();

            if(typeof setup == 'string') return await message.react("⚠️");
            if(message.channel.type != ChannelType.GuildText ) return await message.react("⚠️");
            if(!(setup.secondary.dms.id == message.channel.parentId || setup.secondary.archivedDms.id == message.channel.parentId)) return await message.react("⚠️");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('users').where('channel', '==', message.channelId);

            const docs = (await ref.get()).docs;

            const embed = new EmbedBuilder()
                .setTitle("Matched Users")
                .setColor('Orange')
                .setDescription(docs.length == 0 ? "No users matched." : docs.reduce((prev, current) => { return prev + "<@" + current.id + ">\n" }, ""))

            message.reply({ embeds: [embed] });
        }

        if(message.content.startsWith("?dm")) {
            const setup = await getSetup();

            if(typeof setup == 'string') return await message.react("⚠️");

            if(message.channel.type != ChannelType.GuildText) return;

            if(!(setup.secondary.dms.id == message.channel.parentId || setup.secondary.archivedDms.id == message.channel.parentId)) return;

            const db = firebaseAdmin.getFirestore();

            const user = message.content.substring(4, message.content.length);

            const member = await setup.primary.guild.members.fetch(user).catch(() => undefined);

            if(member == undefined) return await message.react("❎")

            const ref = db.collection('users').doc(member.id);

            if((await ref.get()).exists) {
                await ref.update({
                    channel: message.channel.id,
                })
            } else {
                await ref.set({
                    channel: message.channel.id,
                    id: member.id,
                    nickname: null,
                    emoji: false,
                    settings: {
                        auto_confirm: false,
                    },
                })
            }

            await message.react('✅');
        }

        const db = firebaseAdmin.getFirestore();

        if(message.author && message.author.bot == true) return;
        
        if(cache.channel != message.channelId) return;

        cache.cooldown = new Date().valueOf();
        cache.new = true;

        if(!cache.started) return;

        const ref = db.collection('day').doc(cache.day.toString()).collection('players').doc(message.author.id);

        if((await ref.get()).exists) {
            ref.update({
                messages: FieldValue.increment(1),
                words: FieldValue.increment(message.content.split(" ").length)
            })
        } else {
            ref.set({
                messages: 1,
                words: message.content.split(" ").length,
            })
        }
    } catch(e) {
        console.log(e);
    }
})

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
        if(!cache.started) return;

        console.log(newMessage.content);

        if(newMessage.author && newMessage.author.bot == true) return;
        if(newMessage.channelId != cache.channel) return;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('edits').doc(newMessage.id);

        if(cache.channel != oldMessage.channelId) return;

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
                    content: newMessage.content ?? "No Content",
                    timestamp: newMessage.editedTimestamp ?? new Date().valueOf()
                }],
            })
        }
    } catch(e) {
        console.log(e);
    }
})

client.on(Events.MessageDelete, async (message) => {
    try {
        if(!cache.started) return;

        const channel = message.channel;

        if(message.author && message.author.bot == true) return;
        if(message.channelId != cache.channel) return;

        const setup = await getSetup();

        if(typeof setup == 'string') return;

        if(channel.id != setup.primary.chat.id) return;

        const db = firebaseAdmin.getFirestore();

        const doc = await db.collection('edits').doc(message.id).get();

        const webhook = await setup.primary.chat.createWebhook({
            name: 'Mafia Bot Snipe',
        });

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
                            parent: setup.secondary.dms, 
                            name: user.nickname.toLowerCase(),
                            permissionOverwrites: generateOverwrites(user.id)
                        });
        
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
    } else {
        if(interaction.isRepliable()) {
            await interaction.reply({ content: "Command not found.", ephemeral: true })
        }
    }
});

client.login(process.env.DEV == "TRUE" ? process.env.DEVTOKEN : process.env.TOKEN);

export default client;