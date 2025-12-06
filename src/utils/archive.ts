import { Attachment, AttachmentBuilder, Collection, EmbedBuilder, EmbedFooterOptions, Message, TextChannel, WebhookClient } from "discord.js";
import Stream from 'stream';
import * as https from 'https';

export async function archiveMessage(channel: TextChannel, message: Message, webhook: WebhookClient, note = false, name: string = "") {
    channel.messages.cache.clear();

    let { newAttachments, fails } = await getAttachments(message.attachments);

    var messageEmbeds = message.embeds;

    if(message.content == "") {
        if(message.attachments.size == 0) {
            throw new Error("empty");
        }
    }

    console.log(message);

    var response = await getNickname(message);
    var footer = response.footer;
    var nickname = response.nickname;

    var sent = new Date(0);
    sent.setUTCSeconds(Math.ceil(message.createdTimestamp / 1000));

    if(fails > 0) {
        footer.text += "Failed to retreive " + fails + " attachment" + (fails == 1 ? "" : "s") + ".\n";
    }

    footer.text += "Sent " + sent.toLocaleString('default', { timeZone: 'PST' }) + "\n";

    var embed = new EmbedBuilder()

    const reference = await handleReference(message);

    var optionsWebhook = {
        content: message.content,
        username: nickname,
        avatarURL: message.author.displayAvatarURL(),
        allowedMentions: { parse: [] }, //to prevent pings
        embeds: new Array(),
        files: newAttachments,
        components: reference,
    }

    if(message.editedTimestamp) {
        footer.text += "\nEdited";
    }

    if(note) {
        const reactionsString = await getReactionsString(message);

        if(reactionsString != null) {
            embed.setDescription("Triggered by " + name + ".\n\n" + reactionsString + "\n" + "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.id);
        } else {
            embed.setDescription("Triggered by " + name + ".\n\n" + "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.id);
        }
    }

    embed.setFooter(footer);
    optionsWebhook.embeds = [embed];

    for(var b = messageEmbeds.length - 1; b >= 0; b--) {
        if(messageEmbeds[b].data.type == "rich") {
            optionsWebhook.embeds.unshift(messageEmbeds[b]);
        }
    }

    return await webhook.send(optionsWebhook as any);
}

export async function getAttachments(messageAttachments: Collection<string, Attachment>): Promise<{ newAttachments: any[], fails: number }> {
    var newAttachments = new Array();
    var indexA = 0;
    let fails = 0;
    if(messageAttachments.size > 0) {
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
                if(indexA == messageAttachments.size) {
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
    nickname: string
}


export async function getNickname(message: Message): Promise<nicknameResponse> {
    var footer: EmbedFooterOptions = {text: ""};

    if(message.author.bot == true || message.author.discriminator == "0000") {
        return {footer: footer, nickname: message.author.username};
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
    return {footer: footer, nickname: nickname};
}

export async function getReactionsString(message: Message): Promise<string | null> {
    const reactions = await getReactions(message);

    var reactionsString = "";

    if(reactions.length > 0 && reactions[0].id != null && reactions[0].emoji != null) {
        reactionsString = stringifyReactions(reactions)
        return reactionsString;
    } else {
        return(null);
    }
}

interface Reaction {
    id: string[] | null;
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
            resolve([{id: null, emoji: null}]);
        }
    });
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function handleReference(message: Message): Promise<any[]> {
    var components = new Array();
    if(message.reference != null) {
        components.push({
            "type": 1,
            "components": [
                {
                    "type": 2,
                    "emoji": "⤴️",
                    "style":5,
                    "url": "https://discord.com/channels/" + message.guildId + "/" + message.channelId + "/" + message.reference.messageId
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
