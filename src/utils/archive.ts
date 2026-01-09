import { APIMessage, Attachment, AttachmentBuilder, ChannelType, Collection, EmbedBuilder, EmbedFooterOptions, Message, TextChannel, WebhookClient } from "discord.js";
import Stream from 'stream';
import * as https from 'https';
import { TrackedMessage } from "./mafia/tracking";
import client from "../discord/client";

export async function archiveMessage(channel: TextChannel, message: Message | TrackedMessage, webhook: WebhookClient, note = false, name: string | undefined = undefined, minimal: boolean = false) {
    channel.messages.cache.clear();

    const messageChannel = 'authorId' in message ? (await (await client.guilds.fetch({ guild: message.guildId, cache: true })).channels.fetch( message.channelId, { cache: true })) : message.channel;
    if(messageChannel == null || messageChannel.type != ChannelType.GuildText) throw new Error("CHannel not found!"); 

    const { newAttachments, fails } = await getAttachments(message.attachments, messageChannel, message.id);

    const messageEmbeds = message.embeds;

    if(message.content == "" && !('size' in message.attachments ? message.attachments.size > 0 : message.attachments.length > 0) && message.embeds.length == 0) {
        throw new Error("empty");
    }

    const response = await getNickname(message);

    const sent = new Date(0);
    sent.setUTCSeconds(Math.ceil(message.createdTimestamp / 1000));

    if(fails > 0) {
        response.footer.text += "Failed to retreive " + fails + " attachment" + (fails == 1 ? "" : "s") + ".\n";
    }

    response.footer.text += "Sent " + sent.toLocaleString('default', { timeZone: 'PST' }) + "\n";

    var embed = new EmbedBuilder()

    const reference = await handleReference(message);

    var optionsWebhook = {
        content: message.content,
        username: response.nickname,
        avatarURL: response.avatarURL,
        allowedMentions: { parse: [] }, //to prevent pings
        embeds: new Array(),
        files: newAttachments,
        components: reference,
    }

    if(message.editedTimestamp) {
        response.footer.text += "\nEdited";
    }

    const reactionsString = await getReactionsString(message);

    if((reactionsString != null && minimal) || !note) {
        embed.setDescription(reactionsString);
    } else if(reactionsString != null && !minimal && note) {
        embed.setDescription("Triggered by " + (name ?? response.username) + ".\n\n" + reactionsString + "\n" + "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.id);
    } else if(!minimal && note) {
        embed.setDescription("Triggered by " + (name ?? response.username) + ".\n\n" + "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.id);
    }

    if(!minimal) embed.setFooter(response.footer);

    const description = embed.toJSON().description;
    if(!minimal || (description != undefined && description.length > 0))optionsWebhook.embeds = [embed];

    for(var b = messageEmbeds.length - 1; b >= 0; b--) {
        const messageEmbed = messageEmbeds[b];
        if (('data' in messageEmbed ? messageEmbed.data.type : messageEmbed.type) === "rich") {
            optionsWebhook.embeds.unshift(messageEmbeds[b]);
        }
    }

    return await webhook.send(optionsWebhook as any);
}

export async function getAttachments(messageAttachments: Collection<string, Attachment> | APIMessage["attachments"], messageChannel: TextChannel, messageId: string): Promise<{ newAttachments: any[], fails: number }> {
    var newAttachments = new Array();
    var indexA = 0;
    let fails = 0;

    if('length' in messageAttachments && messageAttachments.length > 0 && typeof messageAttachments[0] == 'string') {
        const discordMessage = await messageChannel.messages.fetch(messageId).catch(() => undefined);

        if(discordMessage == undefined) {
            return { newAttachments: [], fails: messageAttachments.length };

        }

        newAttachments.push(... messageAttachments.map(attachment => discordMessage.attachments.get(attachment as unknown as string)).filter(attachment => attachment != undefined).map(attachment => attachment.toJSON() as Attachment));
    } else if('size' in messageAttachments ? messageAttachments.size > 0 : messageAttachments.length > 0) {
        await new Promise<null>((resolve) => {
            messageAttachments.forEach(async (attachment) => {
                
                console.log(attachment.url);

                if(attachment.url.includes("discordapp")) {
                    var file = await getFile(attachment.url);

                    if(file.readableLength != 0) {
                        newAttachments.push(new AttachmentBuilder(file.read()).setName(attachment.name as string));
                    } else {
                        fails++;
                    }
                } else {
                    newAttachments.push(new AttachmentBuilder(attachment.url).setName(attachment.name as string));
                }
                indexA++;
                if(indexA == ('size' in messageAttachments ? messageAttachments.size : messageAttachments.length)) {
                    resolve(null);
                }
            })
        });
    }
    return { newAttachments, fails};
}


function stringifyReactions(reactions: Reaction[]): string {
    var reactionsString = "";
    for(var a = 0; a < reactions.length; a++) {
        if((reactions[a].id as string[]).length == 0) continue;

        reactionsString += reactions[a].emoji + " - ";
        for(var j = 0; j < (reactions[a].id as string[]).length; j++) {
            reactionsString += "<@" + (reactions[a].id as string[])[j] + ">, ";
        }
        reactionsString = reactionsString.substring(0, reactionsString.length - 2);
        reactionsString += "\n";
    }
    return reactionsString;
}

interface nicknameResponse {
    footer: EmbedFooterOptions,
    nickname: string,
    avatarURL: string | null,
    username: string | null,
}


export async function getNickname(message: Message | TrackedMessage): Promise<nicknameResponse> {
    var footer: EmbedFooterOptions = {text: ""};

    if('authorId' in message) {
        console.log(message.authorId);

        const author = await client.users.fetch(message.authorId).catch(() => undefined);

        var nickname = author ? author.displayName : null;

        return { footer: { text: "Original message by " + (author?.username ?? "unknown") + "\n" }, nickname: nickname ?? message.authorId, username: (author?.username ?? "unknown"), avatarURL: author?.avatarURL() ?? client.user?.avatarURL() ?? "" };
    }

    if(message.author.bot == true || message.author.discriminator == "0000") {
        return {footer: footer, nickname: message.author.username, username: message.author.username, avatarURL: message.author.avatarURL()};
    }

    const member = await message.guild?.members.fetch(message.author.id);
    var nickname = member ? member.displayName: null;
    var hasNickname = false;
    if(nickname != null) {
        hasNickname = true;
    } else {
        nickname = message.author.username;
    }

    if(hasNickname) {
        footer.text = "Original message by " + message.author.username + (message.author.discriminator == "0" ? "\n" : "#" + message.author.discriminator + ".\n" + footer.text);
    }
    return {footer: footer, nickname: nickname, username: message.author.username, avatarURL: message.author.avatarURL()};
}

export async function getReactionsString(message: Message | TrackedMessage): Promise<string | null> {
    console.log(message);

    const reactions = 'authorId' in message ? message.reactions : await getReactions(message);

    var reactionsString = "";

    if(reactions && 'length' in reactions && reactions.length > 0 && reactions[0].id != null && reactions[0].emoji != null) {
        reactionsString = stringifyReactions(reactions)
        return reactionsString;
    } else {
        return(null);
    }
}

export interface Reaction {
    id: string[];
    emoji: string | null;
}

export async function getReactions(message: Message): Promise<Reaction[]> {
    return new Promise(async (resolve) => {
        var index = 0;
        var fetchreactions = new Array();
        message.reactions.cache.map(async function reactionLister(reaction) {
            try {
                var emoji = await reaction.fetch();
                var user = await emoji.users.fetch();

                var emojiUrl;
                if(emoji.emoji.animated == null || emoji.emoji.animated == false) {
                    if(emoji.emoji.id == null) {
                        emojiUrl = emoji.emoji.name;
                    } else {
                        emojiUrl = "<:" + emoji.emoji.name + ":" + emoji.emoji.id + ">"
                    }
                } else {
                    emojiUrl = "<a:" + emoji.emoji.name + ":" + emoji.emoji.id + ">"
                }
                var reactors = new Array();
                user.forEach(function userLister(reactor) {
                    reactors.push(reactor.id);
                });
                fetchreactions.push({id: reactors, emoji: emojiUrl});
            } catch(e) {
                console.log(e);
            }

            index++;
            if(index == message.reactions.cache.size) {
                resolve(fetchreactions);
            }
        });
        await sleep(500); //plz do not remove... for some reason this breaks without, could be possible issues with accessing discord api too quickly, idk...
        //two years later... i know why and this code is stupid, but im too lazy to fix it rn
        if(message.reactions.cache.size == 0) {
            resolve([{id: [], emoji: null}]);
        }
    });
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function handleReference(message: Message | TrackedMessage): Promise<any[]> {
    var components = new Array();
    if(message.reference != null) {
        components.push({
            "type": 1,
            "components": [
                {
                    "type": 2,
                    "emoji": "⤴️",
                    "style":5,
                    "url": "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + (typeof message.reference == 'string' ? message.reference : message.reference.messageId)
                }
            ]

        }) 
    }
    return components;
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
