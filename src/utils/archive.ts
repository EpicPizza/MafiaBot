import { APIActionRowComponent, APIAttachment, APIButtonComponent, APIMessage, APIMessageComponentBaseInteractionData, APIMessageComponentEmoji, Attachment, AttachmentBuilder, ChannelType, Collection, EmbedBuilder, EmbedFooterOptions, Message, TextChannel, User, WebhookClient } from "discord.js";
import Stream from 'stream';
import * as https from 'https';
import { TrackedMessage } from "./mafia/tracking";
import client from "../discord/client";

export async function archiveMessage(options: { 
    message: Message | TrackedMessage, 
    webhook: WebhookClient,
    url?: boolean, 
    nameNote?: string | undefined, 
    reactions?: 'full' | 'reduced' | 'none',
    minimal?: boolean, 
}) {
    const { message, webhook, url = false, nameNote, reactions = 'full', minimal = false } = options;

    if(message.content == "" && !('size' in message.attachments ? message.attachments.size > 0 : message.attachments.length > 0) && message.embeds.length == 0) throw new Error("empty");

    const fetchedMessage = await completeMessage(message, reactions == 'none' ? 'reduced' : reactions);

    var optionsWebhook = {
        content: message.content,
        username: fetchedMessage.nickname ?? fetchedMessage.username,
        avatarURL: fetchedMessage.avatarURL,
        allowedMentions: { parse: [] }, //to prevent pings
        embeds: new Array(),
        files: await buildAttachments(fetchedMessage.attachments),
        components: fetchedMessage.reference ? createReplyButton(fetchedMessage.guildId ?? "---", fetchedMessage.channelId, fetchedMessage.reference) : [],
    }

    let embedFooter = "Original message by " + fetchedMessage.username + ".\nSent at " + new Date(fetchedMessage.createdTimestamp).toLocaleString() + (fetchedMessage.editedTimestamp ? "\nEdited." : "");
    let embedDescription = "";

    if(reactions != 'none') {
        embedDescription = fetchedMessage.reactions ?? "";
    } 
    
    if(nameNote) {
        embedDescription = "Triggered by " + (nameNote) + ".\n\n" + embedDescription;
    }

    if(url) {
        embedDescription = embedDescription + "\n" + "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.id;
    }

    if(!minimal && (embedDescription.length > 0 || embedFooter.length > 0)) {
        const embed = new EmbedBuilder();

        if(embedDescription.length > 0) embed.setDescription(embedDescription);
        if(embedFooter.length > 0) embed.setFooter({ text: embedFooter });

        optionsWebhook.embeds.push(embed);
    }

    optionsWebhook.embeds.push(...fetchedMessage.embeds.filter(embed => ('data' in embed ? embed.data.type : embed.type) === "rich"));

    return await webhook.send(optionsWebhook);
}

export async function completeMessage(message: Message | TrackedMessage, reactionFormat: 'full' | 'reduced' = 'full') {
    const channel = 'authorId' in message ? (await (await client.guilds.fetch({ guild: message.guildId, cache: true })).channels.fetch( message.channelId, { cache: true })) : message.channel;
    if(channel == null || channel.type != ChannelType.GuildText) throw new Error("CHannel not found!"); 

    const [nickname, attachments, reactions] = await Promise.all([
        getNickname(message),
        getAttachments(message.attachments, channel, message.id),
        'authorId' in message ? message.reactions : getReactions(message)
    ]);

    return {
        ...nickname,
        attachments,
        reactions: await getReactionsString(message, reactionFormat, reactions),
        content: message.content,
        cleanContent: message.cleanContent,
        reference: handleReference(message),
        channelId: message.channelId,
        guildId: message.guildId,
        embeds: message.embeds,
        createdTimestamp: message.createdTimestamp,
        editedTimestamp: message.editedTimestamp,
        mentions: 'authorId' in message ? message.mentions : handleMentions(message), 
        id: message.id,
        stars: reactions.find(entry => entry.emoji == "⭐️")?.id.length ?? 0,
    };
}

export function handleMentions(message: Message) {
    const mentions = [] as string[];

    if(message.mentions.everyone) mentions.push("everyone");
    mentions.push(...message.mentions.users.map(user => "u-" + user.id));
    mentions.push(...message.mentions.roles.map(role => "r-" + role.id));

    return mentions;
}

export async function buildAttachments(attachments: { name: string, url: string }[]) {
    return (await Promise.all(attachments.map(async attachment => {
        if(attachment.url.includes("discordapp")) {
            const file = await getFile(attachment.url);

            if(file.readableLength != 0) return new AttachmentBuilder(file.read()).setName(attachment.name as string);
        } else {
            return new AttachmentBuilder(attachment.url).setName(attachment.name as string);
        }
    }))).filter(entry => entry != undefined);
}

export async function getAttachments(attachments: Collection<string, Attachment> | APIMessage["attachments"], channel: TextChannel, messageId: string): Promise<{ name: string, url: string }[]> {
    let fetchedAttachments = [] as { url: string, name: string }[];

    if('length' in attachments && attachments.length > 0 && typeof attachments[0] == 'string') {
        const discordMessage = await channel.messages.fetch(messageId).catch(() => undefined);

        if(discordMessage == undefined) return []

        fetchedAttachments.push(... attachments.map(attachment => discordMessage.attachments.get(attachment as unknown as string)).filter(attachment => attachment != undefined).map(attachment => attachment.toJSON() as Attachment));
    } else if('size' in attachments ? attachments.size > 0 : attachments.length > 0) {
        let array = [] as Attachment[] | APIAttachment[];
        
        if('difference' in attachments) {
            array = attachments.map(attachment => attachment);
        } else {
            array = attachments;
        }

        fetchedAttachments.push(... array.map((attachment: Attachment | APIAttachment) => ({
            name: attachment.title ?? "unknown",
            url: attachment.url,
        })));
    }

    return fetchedAttachments;
}

function stringifyReactions(reactions: Reaction[], format: 'full' | 'reduced'): string {
    return reactions.reduce((prev, curr, i) => {
        prev += "**" + curr.id.length + "** " + curr.emoji;

        if(format == 'full') {
            prev += " -" + curr.id.reduce((prev, curr) => prev + " <@" + curr + ">", "");
        } else if(i != reactions.length - 1) {
            prev += " | ";
        }

        return prev;
    }, "");
}

export async function getNickname(message: Message | TrackedMessage) {
    let user: User | undefined = undefined;

    if('authorId' in message) {
        user = await client.users.fetch(message.authorId).catch(() => undefined);
    } else {
        user = message.author;
    }

    return {
        nickname: user?.displayName ?? undefined,
        avatarURL: user?.avatarURL() ?? undefined,
        username: 'authorId' in message ? message.authorId : message.author.id,
        bot: 'authorId' in message ? user?.bot ?? false : message.author.bot,
    }
}

export async function getReactionsString(message: Message | TrackedMessage, format: 'full' | 'reduced', reactions: Reaction[] | undefined = undefined): Promise<string | null> {
    if(reactions == undefined) reactions = 'authorId' in message ? message.reactions : await getReactions(message);

    if(reactions && 'length' in reactions && reactions.length > 0 && reactions[0].id != null && reactions[0].emoji != null) {
        return stringifyReactions(reactions, format)
    } else {
        return null;
    }
}

export interface Reaction {
    id: string[];
    emoji: string | null;
}

export async function getReactions(message: Message): Promise<Reaction[]> {
    const reactions = [] as { id: string[], emoji: string }[];

    await message.fetch();

    await Promise.all(message.reactions.cache.map(async reaction => {
        await reaction.users.fetch();
        const users = reaction.users.cache.map(user => user.id);

        let parsed = "";

        if(reaction.emoji.id == null) {
            parsed = reaction.emoji.name ?? "❓";
        } else if(reaction.emoji.animated != true) {
            parsed = "<:" + reaction.emoji.name + ":" + reaction.emoji.id + ">";
        } else {
            parsed = "<a:" + reaction.emoji.name + ":" + reaction.emoji.id + ">";
        }

        reactions.push({ id: users, emoji: parsed });
    }));

    return reactions;
}

function handleReference(message: Message | TrackedMessage) {
    if(message.reference == null) return undefined;

    return "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + (typeof message.reference == 'string' ? message.reference : message.reference.messageId);
}

function createReplyButton(guildId: string, channelId: string, messageId: string) {
    return [{
        "type": 1,
        "components": [
            {
                "type": 2,
                "emoji": "⤴️" as APIMessageComponentEmoji,
                "style":5,
                "url": "https://discord.com/channels/" + guildId + "/" + channelId + "/" + messageId,
            }
        ]
    }] satisfies APIActionRowComponent<APIButtonComponent>[];
}

function getFile(url: string): Promise<Stream.Transform> {
    return new Promise<Stream.Transform>(async (resolve) => {
        https.get(url, function (res) {
            const stream = new Stream.Transform();

            res.on('data', function (chunk) {
                stream.push(chunk);
            });

            res.on('end', function () {
                resolve(stream);
            });
        });
    });
}
