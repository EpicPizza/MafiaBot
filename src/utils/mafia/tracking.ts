import { APIMessage, Attachment, FetchMessageOptions, Message, MessageReaction, MessageType, PartialMessage, PartialMessageReaction, PartialUser, TextChannel, User } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import { getAuthority } from "../instance";
import { getReactions, Reaction } from "../archive";

type MessageAction = {
    type: 'delete',
    timestamp: number,
    deleted: { channel: string, id: string, sniped?: string },
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
    attachments: Attachment[],
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

export async function dumpTracking() {
    const messageBatch = [ ...messageBuffer];
    messageBuffer = [];
    const reactionBatch = [ ...reactionBuffer];
    reactionBuffer = [];

    if(messageBatch.length > 0) console.log("dumping", messageBatch.length);

    const toBeEdited = [] as { channel: string, id: string }[];

    reactionBatch.forEach(reaction => {
        toBeEdited.push({
            channel: reaction.channel,
            id: reaction.id,
        });
    });

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

                t.set(db.collection('channels').doc(message.channelId).collection('messages').doc(message.id), {
                    reactions: reactions,
                }, { merge: true });
            } else if(promise.status == 'fulfilled') {
                const { channel, id } = promise.value;

                const reactionEntries = reactionBatch.filter(entry => entry.channel == channel && entry.id == id);

                const reactions = reconcileReactions(reactionEntries, []);

                t.set(db.collection('channels').doc(channel).collection('messages').doc(id), {
                    reactions: reactions,
                }, { merge: true });
            }
        });

        messageBatch.forEach(entry => {
            if(entry.type == 'create' && entry.message) {
                t.set(db.collection('channels').doc(entry.message.channelId).collection('messages').doc(entry.message.id), {
                    ...entry.message,
                    ...(toBeEdited.find(editing => entry.message?.id == editing.id && entry.message?.channelId == editing.channel) ? {} : { reactions: [] })
                }, { merge: true });
            } else if(entry.type == 'edit' && entry.message) {
                t.set(db.collection('channels').doc(entry.message.channelId).collection('messages').doc(entry.message.id), {
                    ...entry.message,
                    ...(entry.log ? { logs: FieldValue.arrayUnion(entry.log) } : {})
                }, { merge: true });
            } else if(entry.type == 'delete' && entry.deleted) {
                t.set(db.collection('channels').doc(entry.deleted.channel).collection('messages').doc(entry.deleted.id), {
                    deleted: true,
                    sniped: entry.deleted.sniped,
                }, { merge: true });
            }
        });
    });
}

function reconcileReactions(reactionEntries: ReactionAction[], reactions: Reaction[]) {
    reactionEntries.forEach(entry => {
        if(entry.type == 'add' && entry.emoji && entry.user) {
            const reaction = reactions.find(reaction => reaction.emoji == entry.emoji);

            if(reaction) {
                reaction.id.push(entry.user);
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

    messageBuffer.push({
        type: 'create',
        message: await transformMessage(message, false),
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

    const entry = {
        type: 'edit' as 'edit',
        message: 'authorId' in newMessage ? newMessage : await transformMessage(newMessage, false),
        timestamp: newMessage.editedTimestamp ?? new Date().valueOf(),
        log: !('partial' in oldMessage && oldMessage.partial) && oldMessage.content != newMessage.content ? {
            content: oldMessage.content,
            cleanContent: oldMessage.cleanContent,
            timestamp: oldMessage.editedTimestamp ?? oldMessage.createdTimestamp,
        } : undefined,
    }

    messageBuffer.push(entry);

    return entry;
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

export async function deleteMessage(message: PartialMessage | Message, sniped: string | undefined = undefined) {
    if(!message.guildId) return;

    const instance = await getAuthority(message.guildId);
    if(!instance || (instance.setup.primary.guild.id == message.guildId && instance.setup.primary.chat.id != message.channelId)) return; //don't need to track every message in the main server

    let adjustedInBuffer = false;
    
    messageBuffer.forEach(message => {
        if((message.type == 'create' || message.type == 'edit') && message.message) {
            message.message.deleted = true;
            message.message.sniped = sniped;
            adjustedInBuffer = true;
        }
    });

    if(!adjustedInBuffer) {
        messageBuffer.push({
            type: 'delete',
            timestamp: new Date().valueOf(),
            deleted: { channel: message.channelId, id: message.id, sniped }
        });
    }
}

export async function catchupChannel(channel: TextChannel, callback: Function) {
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
 
            messageBuffer.push({
                type: 'create',
                message: await transformMessage(message),
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
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('channels').doc(message.channelId).collection('messages').doc(message.id);

    let trackedMessage = (await ref.get()).data() as TrackedMessage | { deleted: true } | undefined;

    const bufferedActions = messageBuffer.filter(entry => entry.type == 'delete' ? (entry.deleted?.id == message.id && entry.deleted.channel == message.channelId) : (entry.message?.id == message.id && entry.message?.channelId == message.channelId));

    bufferedActions.forEach(action => {
        if(action.type == 'create') {
            trackedMessage = action.message;
        } else if(action.type == 'edit' && trackedMessage && 'content' in trackedMessage && action.message && action.message?.content != trackedMessage.content) {
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