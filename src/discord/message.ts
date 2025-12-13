import { ClientEvents, Colors, EmbedBuilder, Events, Message, MessageReplyOptions, TextChannel, WebhookClient } from "discord.js";
import stringArgv from "string-argv";
import client from "./client";
import { getAllExtensions, getExtensions } from "../utils/extensions";
import { checkMessage } from "../utils/google/doc";
import { trackMessage } from "../utils/mafia/tracking";
import type { TextCommand, ReactionCommand } from ".";
import { removeReactions } from "./helpers";
import { firebaseAdmin } from "../utils/firebase";
import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { getSetup } from "../utils/setup";
import { archiveMessage } from "../utils/archive";
import { getGlobal } from "../utils/global";
import { Command } from "commander";
import { getHelpEmbed } from "./help";

export interface Cache {
    day: number;
    started: boolean;
    channel: null | TextChannel;
    extensions: string[];
}

const cache: Cache = {
    day: 0,
    started: false,
    channel: null,
    extensions: [],
} satisfies Cache;

export async function updateCache() {
    const global = await getGlobal();

    const setup = await getSetup();

    if (typeof setup == 'string') return;

    cache.channel = setup.primary.chat;
    cache.day = global.day;
    cache.started = global.started;
    cache.extensions = global.extensions;
}

export async function messageCreateHandler(...[message, throws]: [...ClientEvents[Events.MessageCreate], throws?: boolean]) {
    try {
        const ignore = (process.env.IGNORE ?? "---").split(",");
        if(ignore.includes(message.guildId ?? "---")) return;

        if (!message.content.startsWith("?") || message.content.length < 2 || message.content.replace(/\?/g, "").length == 0) {
            await trackMessage(message, cache);

            if (!message.author.bot) await messageExtensions(cache.extensions, message, cache);

            await checkMessage(message, cache);

            return;
        }

        if (message.author.bot) return;

        const name = message.content.substring(1, message.content.indexOf(" ") == -1 ? message.content.length : message.content.indexOf(" "));

        getAllExtensions().find(extension => {
            if (extension.commandName == name) return true;

            if (typeof extension.commandName == 'string' && extension.shorthands != undefined) {
                const subcommand = extension.shorthands.find(shorthand => shorthand.name == name);

                if (!subcommand) return false;

                message.content = message.content.replace(name, extension.commandName + " " + subcommand.to);

                return true;
            }
        }); //just using find to short circuit once shorthand found*/

        const commands = Array.from(client.commands.values()).filter(command => command.type == "text");
        let program: Command = new Command().name('mafiabot');

        commands.forEach(text => { 
            const command = text.command(); 
            command.exitOverride(); 
            program.addCommand(command); 
        });

        /*let command = client.commands.get(`text-${name}`);
        if (command == undefined || command.type != 'text') return;*/

        //const program = command.command();
        program.exitOverride();
        const values = stringArgv(message.content.slice(1));

        try {
            await program.parseAsync(values, { from: 'user' });
        } catch (e: any) {
            if (e.code === 'commander.unknownCommand') return;

            if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version' || e.code === 'commander.help') {
                // Help or version is displayed.

                let name: string = "unknown";

                const command = program.commands.find(c => c.name() === program.args[0] || c.aliases().includes(program.args[0]));

                if (program.args[0] == "help") {
                    name = "help";
                } else if (program.args.length > 1 && command) {
                    const subcommand = command.commands.find(c => c.name() === program.args[1] || c.aliases().includes(program.args[1]));
                    name = subcommand?.name() ? command.name() + "-" + subcommand?.name() : command.name();
                } else if(command) {
                    name = command.name();
                }

                const embed = getHelpEmbed(name);

                await message.reply({ embeds: [embed] });

                return;
            }

            // For other commander errors, re-throw.
            throw e;
        }

        const parsedCommand = program.commands.find(c => c.name() === program.args[0] || c.aliases().includes(program.args[0]));
        if(parsedCommand == undefined) throw new Error("Command not found!");
        const command = client.commands.get(`text-${parsedCommand.name()}`);
        if(command == undefined) throw new Error("Command not found!");

        try {
            await command.execute({
                name: parsedCommand.name(),
                program: parsedCommand,
                message: message,
                type: 'text',
                reply: (options: MessageReplyOptions) => { return message.reply(options); }, //for consistency with interactions
                user: message.author,
            } satisfies TextCommand);
        } catch (e: any) {
            if(throws) throw e;

            await removeReactions(message);

            await message.reply({ content: e.message });
        }

        /*safeTry(async () => {
            
        }, async (e) => {
            try {
                console.log(e);

                const setup = await getSetup();

                await removeReactions(message);

                if(e.type == 'safe') {
                    await message.reply({ content: 'Error ' + e.exception.code + ": " +  e.exception.message });
                } else {
                    await setup.secondary.logs.send({ embeds: [
                        new EmbedBuilder()
                            .setTitle('Unexpected Error')
                            .setColor(Colors.Red)
                            .setDescription(`${message.content}\n\n` + e.exception.message)
                    ]});
                }
            } catch(e) {
                console.log(e);
            }
        });*/
    } catch (e: any) {
        if(throws) throw e;

        if (message.content.startsWith("?") && message.content.length > 1) {
            let errorMessage = e.message as string;
            if (errorMessage.includes("\n")) errorMessage = errorMessage.slice(0, errorMessage.indexOf("\n")) + " ... trimmed";

            message.reply(errorMessage);
        }

        console.log(e);
    }
}

export async function messageUpdateHandler(...[oldMessage, newMessage]: ClientEvents[Events.MessageUpdate]) {
    try {
        if (!cache.started) return;

        if (newMessage.author && newMessage.author.bot == true) return;
        if (cache.channel && newMessage.channelId != cache.channel.id) return;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('edits').doc(newMessage.id);

        if (cache.channel && cache.channel.id != oldMessage.channelId) return;

        if ((await ref.get()).exists) {
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
                }, {
                    content: newMessage.content ?? "No Content",
                    timestamp: newMessage.editedTimestamp ?? new Date().valueOf()
                }],
            })
        }
    } catch (e) {
        console.log(e);
    }
}

export async function messageDeleteHandler(...[message]: ClientEvents[Events.MessageDelete]) {
    try {
        console.log(message);

        if (!cache.started) return;

        const channel = message.channel;

        if (message.author && message.author.bot == true) return;
        if (cache.channel && message.channelId != cache.channel.id) return;

        const setup = await getSetup();

        if (channel.id != setup.primary.chat.id) return;

        const db = firebaseAdmin.getFirestore();
        if ((await db.collection('delete').doc(message.id).get()).exists) return;
        const doc = await db.collection('edits').doc(message.id).get();

        const webhooks = (await db.collection('webhooks').where('channel', '==', channel.id).get()).docs.map(doc => ({ ...doc.data(), ref: doc.ref })) as { channel: string, token: string, id: string, ref: DocumentReference }[];

        let webhookClient: WebhookClient | undefined = undefined;

        if (webhooks.length > 0) {
            const currentWebhooks = await setup.primary.chat.fetchWebhooks();

            if (currentWebhooks.find(webhook => webhook.id == webhooks[0].id)) {
                webhookClient = new WebhookClient({
                    token: webhooks[0].token,
                    id: webhooks[0].id
                })
            }
        }

        if (webhookClient == undefined) {
            const webhook = await setup.primary.chat.createWebhook({
                name: 'Mafia Bot Snipe',
            });

            if (webhook.token == null) return;

            webhookClient = new WebhookClient({
                id: webhook.id,
                token: webhook.token,
            });
        }

        const result = await archiveMessage(setup.primary.chat, message as any, webhookClient);

        if (!webhooks.find(webhook => webhook.id == webhookClient.id)) {
            await Promise.allSettled(webhooks.map(webhook => webhook.ref.delete()));

            await db.collection('webhooks').add({
                id: webhookClient.id,
                token: webhookClient.token,
                channel: channel.id,
            });
        }

        webhookClient.destroy();

        if (doc.exists && doc.data()) {
            db.collection('edits').doc(result.id).set(
                doc.data() ?? {}
            )
        }
    } catch (e) {
        console.log(e);
    }
}

export async function messageReactionAddHandler(...[reaction, user]: ClientEvents[Events.MessageReactionAdd]) {
    try {
        if (reaction.partial) {
            reaction = await reaction.fetch();
        }

        if (user.bot == true) return;

        const command = client.commands.get('reaction-' + reaction.emoji.toString());

        if (command == undefined || command.type != 'reaction') {
            const db = firebaseAdmin.getFirestore();

            if (cache.channel && cache.channel.id != reaction.message.channelId) return;

            if (!cache.started) return;

            const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('day').doc(cache.day.toString()).collection('players').doc(user.id);

            if ((await ref.get()).exists) {
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
        } catch (e: any) {
            try {
                console.log(e);

                const dm = await client.users.cache.get(user.id)?.createDM();

                if (dm != undefined) {
                    await dm.send({ content: e.message as string })
                }
            } catch (e) {
                console.log(e);
            }
        }
    } catch (e) {
        console.log(e);
    }
}


async function messageExtensions(extensionNames: string[], message: Message, cache: Cache) {
    const extensions = getExtensions(extensionNames);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onMessage(message, cache)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if (fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}