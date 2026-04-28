import { Command } from "commander";
import { z } from "zod";
import { fromZod } from '../utils/text';
import { Extension } from "../utils/extensions";
import { flow } from "../utils/mafia/vote";
import { firebaseAdmin } from "../utils/firebase";
import { getCachedInstances } from "../utils/instance";
import { fetchMessage } from "../utils/mafia/tracking";
import { completeMessage } from "../utils/archive";
import { ColorResolvable, Colors, EmbedBuilder } from "discord.js";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

interface Settings {
    channel: string,
    threshold: number,
};

module.exports = {
    name: "Starboard",
    emoji: "✨",
    commandName: "pin",
    description: "Adds a starboard for mafia channel!",
    priority: [], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: "no meow",
    commands: [],
    interactions: [],
    onStart: async (instance, game) => {
        /**
         * Runs during game start processes.
         */

        console.log("Extension Start");

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (instance, game) => {
        /**
         * Runs after game has locked.
         */

        console.log("Extension Lock");
    },
    onUnlock: async (instance, game, incremented) => {
        /**
         * Runa after game has unlocked.
         * 
         * incremented: boolean - Whether day has advanced or not.
         */

        console.log("Extension Unlock", incremented);

        return;

        /**
         * Nothing to return.
         */
    },
    onCommand: async (command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        console.log(command);

        return;

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction) => {
        /**
         * Interactions for buttons, modals, and select menus. Context menu and slash commands not implemented.
         * 
         *  interaction: {
         *      customId: any,
         *      name: string,
         *      interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction
         *  }
         */

        console.log(extensionInteraction);

        return;
    },
    onMessage: async (message) => {
        /*
         * Keep fetches to a minimum, these can add up. For this reason, only cache is given, only use helper functions when necessary.
         * 
         * cache: { day: number, started: boolean, channel: null | TextChannel } - TextChannel may or may not be fetched depending if bot has fully intialized
         */

        //console.log("Extension", message);

        return;

        /**
         * Nothing to return.
         */
    },
    onEnd: async (instance, game) => {
        /**
         * Runs during game end processes.
         */

        console.log("Extension End");

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (instance, game, voter, voting, type, users, transaction) => {},
    onVotes: async (instance, game, board ) => { 
        return "Example footer.";

        /**
         * Return what is show in the footer in ?votes.
         */
    },
    onHammer: async (instance, game, hammered) => {},
    onRemove: async (instance, game, removed) => {},
    onDump: async (statsBatch, messageBatch, reactionBatch) => {
        const instances = await getCachedInstances();
        const db = firebaseAdmin.getFirestore();

        await Promise.all(instances.map(async instance => {
            const settings = (await db.collection('instances').doc(instance.id).collection('starboard').doc('settings').get()).data() as Settings | undefined;
            if(settings == undefined) {
                console.log("(" + instance.id + ") starboard needs setup");
                return;
            }

            const channel = await instance.setup.primary.guild.channels.fetch(settings.channel, { cache: true });
            if(channel == null || !('messages' in channel)) throw new Error("(" + instance.id + ") starboard channel not found");

            let ids = [] as { id: string, channel: string }[];
            let toDelete = [] as { id: string, channel: string }[];

            messageBatch.forEach(entry => {
                if(entry.type == "edit" || entry.type == "create") {
                    ids.push({ channel: entry.message.channelId, id: entry.message.id });
                } else {
                    toDelete.push({ channel: entry.deleted.channel, id: entry.deleted.id });
                }
            });

            reactionBatch.forEach(entry => {
                ids.push({ channel: entry.channel, id: entry.id });
            });

            toDelete = toDelete.filter(entry => entry.channel == instance.setup.primary.chat.id);
            ids = ids.filter(entry => entry.channel == instance.setup.primary.chat.id && !toDelete.find(deleting => deleting.id == entry.id));

            const messages = (await Promise.all(ids.map(async entry => fetchMessage({ channelId: instance.setup.primary.chat.id, id: entry.id, partial: true })))).filter(entry => entry != undefined && 'authorId' in entry);
            const deleting =  (await Promise.all(toDelete.map(async entry => fetchMessage({ channelId: instance.setup.primary.chat.id, id: entry.id, partial: true })))).filter(entry => entry != undefined && 'authorId' in entry);

            await Promise.allSettled(deleting.map(async trackedMessage => {
                const exists = trackedMessage.starboard == undefined ? undefined : (await channel.messages.fetch({ message: trackedMessage.starboard, cache: true })).id;

                if(exists) {
                    await channel.messages.delete(exists);
                }
            }));

            await Promise.allSettled(messages.map(async trackedMessage => {
                const message = await completeMessage(trackedMessage, "reduced", true);

                if(message.stars < settings.threshold) return;
                
                const tier = getTier(message.stars);
        
                const content = tier.emoji + " **" + message.stars + "** https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.id;
        
                const embed = new EmbedBuilder()
                    .setAuthor({ name: message.nickname ?? message.username, iconURL: message.avatarURL })
                    .setFooter({ text: new Date(message.createdTimestamp).toLocaleString() })
                    .setColor(tier.color);
        
                if(message.content.length > 0 || (message.reactions?.length ?? 0) > 0) embed.setDescription(message.content + "\n\n" + message.reactions);
                
                const image = message.attachments.find(attachment => 'contentType' in attachment && typeof attachment.contentType == 'string' && attachment.contentType.startsWith("image"));
                if(image) embed.setImage(image.url);

                const exists = trackedMessage.starboard == undefined ? undefined : (await channel.messages.fetch({ message: trackedMessage.starboard, cache: true })).id;

                if(exists) {
                    await channel.messages.edit(exists, {
                        embeds: [embed],
                        content: content,
                    });
                } else {
                    const newMessage = await channel.send({
                        embeds: [embed],
                        content: content,
                    });

                    await db.collection('channels').doc(trackedMessage.channelId).collection('messages').doc(trackedMessage.id).update({
                        starboard: newMessage.id,
                    });
                }
            }))
        }))
    },
} satisfies Extension;

function getTier(stars: number): { emoji: string, color: ColorResolvable } {
    if(stars > 25) {
        return { emoji: '🎆', color: Colors.Purple };
    } else if(stars > 21) {
        return { emoji: '🌠', color: Colors.Blue };
    } else if(stars > 18) {
        return { emoji: '✨', color: Colors.Red };
    } else if(stars > 14) {
        return { emoji: '💫', color: Colors.Orange };
    } else if(stars > 10) {
        return { emoji: '🌟', color: Colors.Yellow };
    } else {
        return { emoji: '⭐', color: Colors.White };
    }
}
