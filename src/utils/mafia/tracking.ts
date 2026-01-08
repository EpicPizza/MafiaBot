import { APIMessage, Attachment, FetchMessageOptions, Message, MessageReaction, MessageType, PartialMessage, PartialMessageReaction, PartialUser, TextChannel, User } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import { getAuthority, Instance } from "../instance";
import { getReactions, Reaction } from "../archive";
import { getSetup } from "../setup";

type MessageAction = {
    type: 'delete',
    timestamp: number,
    deleted: { channel: string, id: string },
} | {
    type: 'create'
    message: TrackedMessage,
    timestamp: number,
} | {
    type: 'edit',
    message: Omit<Partial<TrackedMessage>, "channelId" | "id"> & Pick<PartialMessage, "channelId" | "id">,
    timestamp: number,
    log?: Log,
};

interface ReactionAction {
    type: 'add' | 'remove' | 'removeAll' | 'removeReaction',
    id: string,
    channel: string,
    emoji?: string,
    user?: string,
}

interface StatsAction {
    type: 'add',
    id: string,
    day: number,
    instance: string,
    game: string,
    messages: number,
    images: number,
    words: number,
}

interface PurgeAction {
    channel: string,
    id: string,
}

export interface TrackedMessage { 
    channelId: string,
    guildId: string,
    id: string,
    createdTimestamp: number,
    editedTimestamp: number | null,
    type: MessageType,
    content: string,
    cleanContent: string,
    authorId: string,
    pinned: boolean,
    pinning: string | null,
    embeds: APIMessage["embeds"],
    attachments: APIMessage["attachments"],
    mentions: string[],
    reference: string | null,
    poll: boolean,
    reactions: Reaction[],
    deleted?: boolean,
    logs?: Log[],
    sniped?: string,
}

interface Log {
    content: string,
    cleanContent: string,
    timestamp: number,
}

let messageBuffer = [] as MessageAction[];
let reactionBuffer = [] as ReactionAction[];
let statsBuffer = [] as StatsAction[];
let purgeBuffer = [] as PurgeAction[];

let dumping = false;
let initialized = false;

export async function dumpTracking() {
    if(!initialized) return;

    dumping = true;

    const messageBatch = [ ...messageBuffer];
    messageBuffer = [];
    const reactionBatch = [ ...reactionBuffer];
    reactionBuffer = [];
    const statsBatch = [ ...statsBuffer];
    statsBuffer = [];

    if(messageBatch.length > 0) console.log("dumping", messageBatch.length);

    const toBeEdited = [] as { channel: string, id: string }[];

    reactionBatch.forEach(reaction => {
        toBeEdited.push({
            channel: reaction.channel,
            id: reaction.id,
        });
    });

    const compressedStats = reconcileStats(statsBatch);

    const db = firebaseAdmin.getFirestore();

    await db.runTransaction(async t => {
        const editing = await Promise.allSettled(toBeEdited.map(async editing => {
            return {
                doc: await t.get(db.collection('channels').doc(editing.channel).collection('messages').doc(editing.id)),
                channel: editing.channel, 
                id: editing.id 
            };
        }));

        editing.forEach(promise => {
            if(promise.status == 'fulfilled' && promise.value.doc.data() != undefined) {
                const message = promise.value.doc.data() as TrackedMessage;

                const reactionEntries = reactionBatch.filter(entry => entry.channel == message.channelId && entry.id == message.id);

                const reactions = reconcileReactions(reactionEntries, message.reactions);

                const stars = reactions.find(reaction => reaction.emoji == "⭐")?.id.length ?? 0;

                t.set(db.collection('channels').doc(message.channelId).collection('messages').doc(message.id), {
                    reactions: reactions,
                    stars: stars,
                }, { merge: true });
            } else if(promise.status == 'fulfilled') {
                const { channel, id } = promise.value;

                const reactionEntries = reactionBatch.filter(entry => entry.channel == channel && entry.id == id);

                const reactions = reconcileReactions(reactionEntries, []);

                const stars = reactions.find(reaction => reaction.emoji == "⭐")?.id.length ?? 0;

                t.set(db.collection('channels').doc(channel).collection('messages').doc(id), {
                    reactions: reactions,
                    stars: stars,
                }, { merge: true });
            }
        });

        messageBatch.forEach(entry => {
            if(entry.type == 'create') {
                t.set(db.collection('channels').doc(entry.message.channelId).collection('messages').doc(entry.message.id), {
                    ...entry.message,
                    ...(toBeEdited.find(editing => entry.message?.id == editing.id && entry.message?.channelId == editing.channel) ? {} : { reactions: [] })
                }, { merge: true });
            } else if(entry.type == 'edit') {
                t.set(db.collection('channels').doc(entry.message.channelId).collection('messages').doc(entry.message.id), {
                    ...entry.message,
                    ...(entry.log ? { logs: FieldValue.arrayUnion(entry.log) } : {})
                }, { merge: true });
            } else if(entry.type == 'delete') {
                t.set(db.collection('channels').doc(entry.deleted.channel).collection('messages').doc(entry.deleted.id), {
                    deleted: true
                }, { merge: true });
            }
        });

        compressedStats.forEach(entry => {
            t.set(db.collection('instances').doc(entry.instance)
                    .collection('games').doc(entry.game)
                    .collection('days').doc(entry.day.toString())
                    .collection('stats').doc(entry.id), {
                messages: FieldValue.increment(entry.messages),
                words: FieldValue.increment(entry.words),
                images: FieldValue.increment(entry.images)
            }, { merge: true });
        });

        t.set(db.collection('channels').doc('tracking'), {
            timestamp: new Date().valueOf(),
        });
    });

    dumping = false;
}

function reconcileStats(statsEntries: StatsAction[]) {
    const compressed = [] as StatsAction[];

    for(let i = 0; i < statsEntries.length; i++) {
        const entry = statsEntries[i];
        const existing = compressed.find(e => e.day == entry.day && e.game == entry.game && e.id == entry.id);

        console.log("existing found", existing, entry);

        if(existing) {
            existing.messages += entry.messages;
            existing.words += entry.words;
            existing.images += entry.images;
        } else {
            compressed.push({ ...entry });
        }
    }

    return compressed;
}

function reconcileReactions(reactionEntries: ReactionAction[], reactions: Reaction[]) {
    reactionEntries.forEach(entry => {
        if(entry.type == 'add' && entry.emoji && entry.user) {
            const reaction = reactions.find(reaction => reaction.emoji == entry.emoji);

            if(reaction) {
                if(!reaction.id.includes(entry.user)) reaction.id.push(entry.user);
            } else {
                reactions.push({
                    emoji: entry.emoji,
                    id: [ entry.user ]
                });
            }
        } else if(entry.type == 'remove' && entry.emoji && entry.user) {
            const reaction = reactions.find(reaction => reaction.emoji == entry.emoji);

            if(reaction && reaction.id.indexOf(entry.user) != -1) reaction.id.splice(reaction.id.indexOf(entry.user, 1));
        } else if(entry.type == 'removeReaction' && entry.emoji) {
            const reaction = reactions.findIndex(reaction => reaction.emoji == entry.emoji);

            if(reaction != -1) reactions.splice(reaction, 1);
        } else if(entry.type == 'removeAll') {
           reactions = [];
        }
    });

    return reactions;
}

export async function addReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    if(!reaction.message.guildId) return;

    const instance = await getAuthority(reaction.message.guildId);
    if(!instance || (instance.setup.primary.guild.id == reaction.message.guildId && instance.setup.primary.chat.id != reaction.message.channelId)) return;
    
    reactionBuffer.push({
        type: 'add',
        id: reaction.message.id,
        channel: reaction.message.channelId,
        user: user.id,
        emoji: reaction.emoji.toString(),
    });
}

export async function removeReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    if(!reaction.message.guildId) return;

    const instance = await getAuthority(reaction.message.guildId);
    if(!instance || (instance.setup.primary.guild.id == reaction.message.guildId && instance.setup.primary.chat.id != reaction.message.channelId)) return;
    
    reactionBuffer.push({
        type: 'remove',
        id: reaction.message.id,
        channel: reaction.message.channelId,
        user: user.id,
        emoji: reaction.emoji.toString(),
    });
}

export async function removeAllReactions(message: Message | PartialMessage) {
    if(!message.guildId) return;

    const instance = await getAuthority(message.guildId);
    if(!instance || (instance.setup.primary.guild.id == message.guildId && instance.setup.primary.chat.id != message.channelId)) return;

    reactionBuffer.push({
        type: 'removeAll',
        id: message.id,
        channel: message.channelId,
    });
}

export async function removeReactionEmoji(reaction: MessageReaction | PartialMessageReaction) {
    if(!reaction.message.guildId) return;

    const instance = await getAuthority(reaction.message.guildId);
    if(!instance || (instance.setup.primary.guild.id == reaction.message.guildId && instance.setup.primary.chat.id != reaction.message.channelId)) return;
    
    reactionBuffer.push({
        type: 'removeReaction',
        id: reaction.message.id,
        channel: reaction.message.channelId,
        emoji: reaction.emoji.toString(),
    });
}

export async function createMessage(message: Message) {
    if(!message.guildId) return;

    const instance = await getAuthority(message.guildId);
    if(!instance || (instance.setup.primary.guild.id == message.guildId && instance.setup.primary.chat.id != message.channelId)) return; //don't need to track every message in the main server

    if(instance.setup.primary.chat.id == message.channelId && instance.global.started) {
        statsBuffer.push({
            type: 'add',
            id: message.author.id,
            day: instance.global.day,
            game: instance.global.game ?? "---",
            instance: instance.id,
            images: message.attachments.reduce((acc, value) => acc + (value.contentType?.startsWith("image") ? 1 : 0), 0),
            words: message.content.split(" ").length,
            messages: 1,
        })
    }
    
    const transformed = await transformMessage(message, false);

    if(transformed.pinning && transformed.reference) {
        messageBuffer.push({
            type: 'edit',
            message: {
                pinned: true,
                channelId: transformed.channelId,
                id: transformed.reference,
            },
            timestamp: new Date().valueOf(),
        });
    }

    messageBuffer.push({
        type: 'create',
        message: transformed,
        timestamp: message.createdTimestamp,
    });
}

export async function updateMessage(oldMessage: PartialMessage | Message | TrackedMessage, newMessage: Message | TrackedMessage) {
    if(!newMessage.guildId) return;

    const instance = await getAuthority(newMessage.guildId);
    if(!instance || (instance.setup.primary.guild.id == newMessage.guildId && instance.setup.primary.chat.id != newMessage.channelId)) return; //don't need to track every message in the main server

    if('partial' in oldMessage && oldMessage.partial) {
        const db = firebaseAdmin.getFirestore();
        const fetchedMessage = (await db.collection('channels').doc(newMessage.channelId).collection('messages').doc(newMessage.id).get()).data() as TrackedMessage | undefined;

        if(fetchedMessage != undefined) {
            oldMessage = {
                content: fetchedMessage.content,
                cleanContent: fetchedMessage.cleanContent,
                editedTimestamp: fetchedMessage.editedTimestamp,
                createdTimestamp: fetchedMessage.createdTimestamp,
                partial: false,
            } as Message;
        }
    }

    const transformed = 'authorId' in newMessage ? newMessage : await transformMessage(newMessage, false);

    const entry = {
        type: 'edit' as 'edit',
        message: { ... transformed, pinned: transformed.pinned ? true : undefined },
        timestamp: newMessage.editedTimestamp ?? new Date().valueOf(),
        log: !('partial' in oldMessage && oldMessage.partial) && oldMessage.content != newMessage.content ? {
            content: oldMessage.content,
            cleanContent: oldMessage.cleanContent,
            timestamp: oldMessage.editedTimestamp ?? oldMessage.createdTimestamp,
        } : undefined,
    }

    messageBuffer.push(entry);

    return { ...entry, message: {...entry.message, pinned: entry.message.pinned == undefined ? false : true } };
}

export async function updateSnipeMessage(snipe: { channelId: string, id: string }, original: string) {
    messageBuffer.push({
        type: 'edit',
        message: {
            sniped: original,
            channelId: snipe.channelId,
            id: snipe.id
        },
        timestamp: new Date().valueOf(),
    });
}

export function purgeMessage(message: PartialMessage | Message) {
    if(!purgeBuffer.find(action => action.id == message.id && action.channel == message.channelId)) purgeBuffer.push({ id: message.id, channel: message.channelId });
}

export async function deleteMessage(message: PartialMessage | Message) {
    if(!message.guildId) return;

    const instance = await getAuthority(message.guildId);
    if(!instance || (instance.setup.primary.guild.id == message.guildId && instance.setup.primary.chat.id != message.channelId)) return; //don't need to track every message in the main server

    let adjustedInBuffer = false;
    
    messageBuffer.forEach(message => {
        if((message.type == 'create' || message.type == 'edit') && message.message) {
            message.message.deleted = true;
            adjustedInBuffer = true;
        }
    });

    if(!adjustedInBuffer) {
        messageBuffer.push({
            type: 'delete',
            timestamp: new Date().valueOf(),
            deleted: { channel: message.channelId, id: message.id }
        });
    }

    if(purgeBuffer.find(action => action.id == message.id && action.channel == message.channelId)) return true;
}

export async function catchupChannel(channel: TextChannel, callback: Function, statsTracking: boolean) {
    const instance = await getAuthority(channel.guildId);
    if(!instance || (instance.setup.primary.guild.id == channel.guildId && instance.setup.primary.chat.id != channel.id)) return; //don't need to track every message in the main server

    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('channels').doc(channel.id).collection('messages');

    const docs = (await ref.orderBy('createdTimestamp', 'desc').limit(1).get()).docs;
    const latestMessage = docs.length > 0 ? docs[0].data() as TrackedMessage : undefined;

    console.log("latest", latestMessage);
    
    let message = null as null | Message;
    let fetched = 0;

    while(true) {
        const options = { limit: 100, before: message?.id, cache: false }; //cache only stores 200 messages max, so pointless in this case
        const messages = await channel.messages.fetch(options);

        console.log("fetched", messages.size);

        let endFound = false;

        await Promise.allSettled(messages.map(async (message: Message) => {
            if(message.id == latestMessage?.id || message.createdTimestamp < (latestMessage?.createdTimestamp ?? 0)) {
                endFound = true;
                return;
            }

            if(instance.setup.primary.chat.id == message.channelId && instance.global.started && statsTracking) {
                statsBuffer.push({
                    type: 'add',
                    id: message.author.id,
                    day: instance.global.day,
                    game: instance.global.game ?? "---",
                    instance: instance.id,
                    images: message.attachments.reduce((acc, value) => acc + (value.contentType?.startsWith("image") ? 1 : 0), 0),
                    words: message.content.split(" ").length,
                    messages: 1,
                })
            }
 
            const transformed = await transformMessage(message, false);

            if(transformed.pinning && transformed.reference) {
                messageBuffer.push({
                    type: 'edit',
                    message: {
                        pinned: true,
                        channelId: transformed.channelId,
                        id: transformed.reference,
                    },
                    timestamp: new Date().valueOf(),
                });
            }

            messageBuffer.push({
                type: 'create',
                message: transformed,
                timestamp: message.createdTimestamp,
            });
        }));

        fetched += messages.size;
        await callback(fetched);

        if(messages.size < 100 || endFound) {
            break;
        }

        message = messages.at(messages.size - 1) ?? message;

        await sleep(200);
    }

    return fetched;
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function fetchMessage(message: PartialMessage | Message | { channelId: string, id: string, partial: true }): Promise<TrackedMessage | { deleted: true } | undefined> {
    await processing();
    
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('channels').doc(message.channelId).collection('messages').doc(message.id);

    let trackedMessage = (await ref.get()).data() as TrackedMessage | { deleted: true } | undefined;

    const bufferedActions = messageBuffer.filter(entry => entry.type == 'delete' ? (entry.deleted?.id == message.id && entry.deleted.channel == message.channelId) : (entry.message?.id == message.id && entry.message?.channelId == message.channelId));

    bufferedActions.forEach(action => {
        if(action.type == 'create') {
            trackedMessage = action.message;
        } else if(action.type == 'edit' && trackedMessage && 'content' in trackedMessage && action.message?.content != trackedMessage.content) {
            trackedMessage = {
                ...trackedMessage,
                ...action.message,
                logs: [
                    ...(trackedMessage.logs ?? []),
                    {
                        content: trackedMessage.content,
                        cleanContent: trackedMessage.cleanContent,
                        timestamp: trackedMessage.editedTimestamp ?? trackedMessage.createdTimestamp,
                    }
                ]
            } satisfies TrackedMessage;
        } else if(action.type == 'delete' && trackedMessage) {
            trackedMessage.deleted = true;
        }
    })

    if(trackedMessage && 'createdTimestamp' in trackedMessage && message.partial == false && message.content != trackedMessage.content) {
        const newEntry = await updateMessage(trackedMessage, message);

        if(newEntry != undefined) {
            trackedMessage = {
                ...newEntry.message,
                ...(newEntry.log ? { logs: [ ...(newEntry.message.logs ?? []), newEntry.log ] } : {})
            }
        }
    }

    return trackedMessage;
}

export async function fetchStats(instance: string, game: string, day: number) {
    await processing();

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance).collection('games').doc(game).collection('days').doc(day.toString()).collection('stats');

    const docs = (await ref.get()).docs.map(doc => ({ ...doc.data(), instance, game, day, type: "add", id: doc.ref.id })) as StatsAction[];

    const compressed = reconcileStats(statsBuffer).filter(entry => entry.instance == instance && entry.game == game && entry.day == day);

    docs.forEach(doc => {
        const cached = compressed.find(entry => entry.id == doc.id);

        if(cached) {
            doc.messages += cached.messages;
            doc.words += cached.words;
            doc.images += cached.images;
        }
    });

    compressed.forEach(entry => {
        if(!docs.find(stat => stat.id == entry.id)) {
            docs.push({
                ...entry
            });
        }
    });

    console.log(docs);

    return docs;
}

export async function transformMessage(message: Message, reactions: boolean = true) {
    const mentions = [] as string[];

    if(message.mentions.everyone) mentions.push("everyone");
    mentions.push(...message.mentions.users.map(user => "u-" + user.id));
    mentions.push(...message.mentions.roles.map(role => "r-" + role.id));

    return {
        channelId: message.channelId,
        guildId: message.guildId ?? "mafia bot does not support dms",
        id: message.id,
        createdTimestamp: message.createdTimestamp,
        editedTimestamp: message.editedTimestamp,
        type: message.type,
        content: message.content,
        cleanContent: message.cleanContent,
        authorId: message.author.id,
        pinned: message.pinned,
        pinning: message.type == MessageType.ChannelPinnedMessage ? (await message.fetchReference()).url : null,
        //@ts-expect-error
        embeds: message.toJSON().embeds,
        //@ts-expect-error
        attachments: message.toJSON().attachments,
        mentions: mentions,
        reference: message.reference?.messageId ?? null,
        poll: message.poll ? true : false,
        ... (reactions ? { reactions: await getReactions(message) } : {}),
    } satisfies Partial<TrackedMessage> as TrackedMessage;
}

export async function startup(instances: Instance[]) {
    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('channels').doc('tracking');
    const lastFetched = (await ref.get()).data()?.timestamp as number | undefined ?? undefined;

    if(!lastFetched || (new Date().valueOf() - lastFetched) > (1000 * 60 * 5)) {
        console.log("Too long... aborting.");

        return;
    }

    await Promise.all(instances.map(async instance => {
        const setup = await getSetup(instance.id);

        const messagesFetched = await catchupChannel(setup.primary.chat, async (length: number) => {
            console.log("(" + instance.id + ") Fetching messages... (" + length + ")");
        }, true);

        console.log("Fetched " + messagesFetched + " messages.");
    }))

    initialized = true;
}

export async function setInitialized(state: boolean) {
    initialized = state;
}

export function addStatsAction(action: StatsAction) {
    statsBuffer.push(action);
}

async function processing() {
    if(dumping) {
        await new Promise((resolve) => {
            setTimeout(() => {
                if(!dumping) resolve(0);
            }, 100);
        })
    }
}