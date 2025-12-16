import { ClientEvents, Colors, EmbedBuilder, Events, Guild, Message, MessageReplyOptions, TextChannel, WebhookClient } from "discord.js";
import stringArgv from "string-argv";
import client from "./client";
import { getAllExtensions, getExtensions } from "../utils/extensions";
import { addReaction, createMessage, deleteMessage, removeAllReactions, removeReactionEmoji, removeReaction, updateMessage, fetchMessage, transformMessage, updateSnipeMessage } from "../utils/mafia/tracking";
import type { TextCommand, ReactionCommand } from ".";
import { removeReactions } from "./helpers";
import { firebaseAdmin } from "../utils/firebase";
import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { getSetup } from "../utils/setup";
import { archiveMessage } from "../utils/archive";
import { getGlobal } from "../utils/global";
import { Command } from "commander";
import { getHelpEmbed } from "./help";
import { getAuthority } from "../utils/instance";

export async function messageCreateHandler(...[message, throws]: [...ClientEvents[Events.MessageCreate], throws?: boolean]) {
    try {
        const ignore = (process.env.IGNORE ?? "---").split(",");
        if(ignore.includes(message.guildId ?? "---")) return;

        await createMessage(message);

        if (!message.content.startsWith("?") || message.content.length < 2 || message.content.replace(/\?/g, "").length == 0) return;

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

            console.log(e);

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
        await updateMessage(oldMessage, newMessage);
    } catch (e) {
        console.log(e);
    }
}

export async function messageDeleteHandler(...[message]: ClientEvents[Events.MessageDelete]) {
    try {
        if(!message.guildId) return;
        
        const instance = await getAuthority(message.guildId);
        if(!(instance && instance.setup.primary.guild.id == message.guildId && instance.setup.primary.chat.id == message.channelId)) return; //don't need to track every message in the main server

        await deleteMessage(message);

        if(instance.global.started == false) return;

        const tracked = await fetchMessage(message);

        if(!tracked || !('createdTimestamp' in tracked)) return;

        const db = firebaseAdmin.getFirestore();

        const webhooks = (await db.collection('webhooks').where('channel', '==', instance.setup.primary.chat.id).get()).docs.map(doc => ({ ...doc.data(), ref: doc.ref })) as { channel: string, token: string, id: string, ref: DocumentReference }[];

        let webhookClient: WebhookClient | undefined = undefined;

        if (webhooks.length > 0) {
            const currentWebhooks = await instance.setup.primary.chat.fetchWebhooks();

            if (currentWebhooks.find(webhook => webhook.id == webhooks[0].id)) {
                webhookClient = new WebhookClient({
                    token: webhooks[0].token,
                    id: webhooks[0].id
                })
            }
        }

        if (webhookClient == undefined) {
            const webhook = await instance.setup.primary.chat.createWebhook({
                name: 'Mafia Bot Snipe',
            });

            if (webhook.token == null) return;

            webhookClient = new WebhookClient({
                id: webhook.id,
                token: webhook.token,
            });
        }

        const result = await archiveMessage(instance.setup.primary.chat, message.partial == true ? tracked : message, webhookClient);

        if (!webhooks.find(webhook => webhook.id == webhookClient.id)) {
            await Promise.allSettled(webhooks.map(webhook => webhook.ref.delete()));

            await db.collection('webhooks').add({
                id: webhookClient.id,
                token: webhookClient.token,
                channel: instance.setup.primary.chat.id,
            });
        }

        webhookClient.destroy();

        await updateSnipeMessage({ channelId: result.channel_id, id: result.id }, message.id);
    } catch (e) {
        console.log(e);
    }
}

export async function messageReactionRemoveHandler(...[reaction, user]: ClientEvents[Events.MessageReactionRemove]) {
    try {
        await removeReaction(reaction, user);
    } catch(e) {
        console.log(e);
    }
}

export async function messageReactionRemoveAllHandler(...[message]: ClientEvents[Events.MessageReactionRemoveAll]) {
    try {
        await removeAllReactions(message);
    } catch(e) {
        console.log(e);
    }
}

export async function messageReactionRemoveEmojiHandler(...[reaction]: ClientEvents[Events.MessageReactionRemoveEmoji]) {
    try {
        await removeReactionEmoji(reaction);
    } catch(e) {
        console.log(e);
    }
}

export async function messageReactionAddHandler(...[reaction, user]: ClientEvents[Events.MessageReactionAdd]) {
    try {
        await addReaction(reaction, user);

        if (reaction.partial) {
            reaction = await reaction.fetch();
        }

        if (user.bot == true) return;

        const command = client.commands.get('reaction-' + reaction.emoji.toString());

        if (command == undefined || command.type != 'reaction') {

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


async function messageExtensions(extensionNames: string[], message: Message) {
    const extensions = getExtensions(extensionNames);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onMessage(message)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if (fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}