import { DiscordSnowflake } from "@sapphire/snowflake";
import { ActionRowBuilder, AttachmentPayload, BitField, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, Client, ClientUser, Collection, ComponentType, EmojiIdentifierResolvable, MentionableSelectMenuBuilder, Message, MessageEditOptions, MessageMentions, MessagePayload, MessageReplyOptions, MessageType, RoleSelectMenuBuilder, StringSelectMenuBuilder, User, UserSelectMenuBuilder } from "discord.js";
import client from "../discord/client";
import { messageCreateHandler } from "../discord/message";
import { getSetup, Setup } from "../utils/setup";

export type ExportableEmbed = {
    title: string | null,
    description: string | null,
    url: string | null,
    image: string | null,
    color: string | null,
    footer: {
        text: string,
        url: string | null,
    } | null,
    author: {
        name: string,
        url: string | null,
        icon_url: string | null,
    } | null,
    fields: {
        name: string,
        value: string,
        inline: boolean,
    }[] | null
}

type ExportableBaseButton = {
    label: string | null,
    emoji: string | null,
    style: number,
}

export type ExportableButton = ExportableBaseButton & ({
    customId: string | null,
    type: "customId",
} | {
    url: string | null,
    type: "url",
});

export type Transform = ReturnType<typeof transform>;

export type CommandResult = Transform | { reaction: EmojiIdentifierResolvable } | { content: string } | { error: string };

export async function runCommand(content: string, instance: string, setup: Setup | undefined = undefined) {
    if(setup == undefined) setup = await getSetup(instance);

    const user = client.user;

    if(user == null) throw new Error("Client user not defined!");
    
    return new Promise<CommandResult>(async (resolve) => {
        const message = await createMessage(setup, { ...user, bot: false, id: process.env.OWNER } as ClientUser, content, {
            onReact: (emoji) => {
                console.log(emoji)

                if(emoji == "<a:loading:1256150236112621578>") return;

                resolve({
                    reaction: emoji,
                });
            },
            onReply: (options) => {
                const data = transform(options);

                resolve(data);
            }
        })

        try {
            await messageCreateHandler(message, true);
        } catch(e: any) {
            console.log(e);

            resolve({
                error: e.message as string, 
            })
        }
    });
}

export async function createMessage(setup: Setup, user: User, content: string, hooks: { 
    onDelete?: () => Promise<unknown> | unknown, 
    onEdit?: (options: string | MessagePayload | MessageEditOptions) => Promise<unknown> | unknown 
    onReply?: (options: string | MessagePayload | MessageReplyOptions) => Promise<unknown> | unknown,
    onReact?: (emoji: EmojiIdentifierResolvable) => Promise<unknown> | unknown,
}) {
    const spoofedMessage = {
        _cacheType: true,
        _patch: () => { return {}; },
        activity: null,
        applicationId: null,
        attachments: new Collection(),
        author: user,
        bulkDeletable: false,
        channel: setup.primary.chat,
        channelId: setup.primary.chat.id,
        cleanContent: "",
        components: [],
        content: content,
        createdAt: new Date(),
        createdTimestamp: Math.floor(new Date().valueOf() / 1000),
        crosspostable: false,
        deletable: false,
        editable: false,
        editedAt: null,
        editedTimestamp: null,
        embeds: [],
        groupActivityApplication: null,
        guildId: setup.primary.guild.id,
        guild: setup.primary.guild,
        hasThread: false,
        id: DiscordSnowflake.generate().toString(),
        interaction: null,
        interactionMetadata: null,
        member: await setup.primary.guild.members.fetch({ user: user.id, cache: true}),
        mentions: undefined as unknown as MessageMentions, //TODO,
        nonce: null,
        partial: false,
        pinnable: false,
        pinned: false,
        reactions: {
            message: {} as unknown as Message<true>,
            removeAll: async () => {
                return spoofedMessage as Message<true>
            },
            holds: undefined as any,
            _cache: new Collection(),
            cache: new Collection(),
            _add: (() => undefined) as any,
            resolve: (() => undefined) as any,
            resolveId: (() => undefined) as any,
            client: client as Client<true>,
        },
        stickers: new Collection(),
        position: -1,
        roleSubscriptionData: null,
        resolved: null,
        system: false,
        thread: null,
        tts: false,
        poll: null,
        call: null,
        type: MessageType.Default,
        url: "https://frcmafia.com/",
        webhookId: null,
        flags: new BitField(),
        reference: null,
        messageSnapshots: new Collection(),
        awaitMessageComponent: (() => undefined) as any,
        awaitReactions: (() => undefined) as any,
        createReactionCollector: (() => undefined) as any,
        createMessageComponentCollector: (() => undefined) as any,
        delete: (() => {
            if(hooks.onDelete) hooks.onDelete();

            return spoofedMessage;
        }),
        edit: ((options: string | MessagePayload | MessageEditOptions) => {
            if(hooks.onEdit) hooks.onEdit(options);

            return spoofedMessage;
        }),
        equals: (message) => { return false;  },
        fetchReference: (() => undefined) as any,
        fetchWebhook: (() => undefined) as any,
        crosspost: (() => undefined) as any,
        fetch: (() => undefined) as any,
        pin: (() => undefined) as any,
        react: ((emoji: EmojiIdentifierResolvable) => {
            if(hooks.onReact) hooks.onReact(emoji);
        }) as any,
        removeAttachments: (() => undefined) as any,
        reply: ((options: string | MessagePayload | MessageReplyOptions) => {
            if(hooks.onReply) hooks.onReply(options);

            return spoofedMessage;
        }),
        forward: (() => undefined) as any,
        resolveComponent: (() => undefined) as any,
        startThread: (() => undefined) as any,
        suppressEmbeds: (() => undefined) as any,
        toJSON: (() => undefined) as any,
        unpin: (() => undefined) as any,
        inGuild: (() => undefined) as any,
        client: client as unknown as Client<true>,
        spoofed: true,
    } as unknown as Message<true>;

    console.log("hi!");

    return spoofedMessage;
}

export function transform(options: string | MessagePayload | MessageEditOptions | MessageReplyOptions): {
    content: string | null,
    embeds: ExportableEmbed[],
    components: ExportableButton[]
    json?: undefined | unknown,
} {
    if(typeof options == 'string') {
        return {
            content: options,
            embeds: [],
            components: [],
        }
    } else if('content' in options || 'embeds' in options || 'components' in options || 'files' in options) {
        const components = [] as ExportableButton[];

        const rows = ('components' in options && options.components ? options.components ?? [] : []) as unknown as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder | ChannelSelectMenuBuilder | MentionableSelectMenuBuilder | UserSelectMenuBuilder | RoleSelectMenuBuilder>[];
        
        rows.forEach(row => {
            row.components.map(component => component.data).forEach(component => {
                switch(component.type) {
                    case ComponentType.Button:
                        if(component.style == ButtonStyle.Link) {
                            components.push({
                                label: component.label ?? null,
                                url: component.url ?? null,
                                emoji: component.emoji as string ?? null,
                                style: component.style,
                                type: "url"
                            });
                        } else if('custom_id' in component) {
                            components.push({
                                label: component.label ?? null,
                                emoji: component.emoji as string ?? null,
                                customId: component.custom_id ?? null,
                                style: component.style ?? 1,
                                type: "customId",
                            });
                        }

                        break;
                    default:
                        break;
                }
            })
        });

        const files = options.files?.filter(file => typeof file == 'object' && 'name' in file && file.name == 'result.json');
        const file = files && files.length > 0 ? files[0] as AttachmentPayload : undefined;

        console.log(options.files, file);

        return {
            content: 'content' in options && options.content ? options.content ?? null : null,
            embeds: ('embeds' in options && options.embeds ? options.embeds ?? [] : []).map(embed => {
                if('toJSON' in embed) embed = embed.toJSON();

                const exportableEmbed: ExportableEmbed = {
                    title: embed.title ?? null,
                    description: embed.description ?? null,
                    url: embed.url ?? null,
                    image: embed.image?.url ?? null,
                    color: embed.color ? "#" + embed.color.toString(16) : null,
                    footer: embed.footer ? {
                        text: embed.footer.text,
                        url: embed.footer.icon_url ?? null,
                    } : null,
                    author: embed.author ? {
                        name: embed.author.name,
                        url: embed.author.url ?? null,
                        icon_url: embed.author.icon_url ?? null,
                    } : null,
                    fields: (embed.fields ?? []).map(field => ({
                        name: field.name,
                        value: field.value,
                        inline: field.inline ?? false,
                    })) ?? null,
                };

                return exportableEmbed;
            }),

            components: components,
            json: (file && Buffer.isBuffer(file.attachment) ? JSON.parse(file.attachment.toString()) : undefined)
        }
    }

    return {
        content: null,
        embeds: [],
        components: [],
    }
}

export function fromJSON(result: unknown) {
    const buffer = Buffer.from(JSON.stringify(result, null, 2), 'utf-8');

    return [{
        attachment: buffer,
        name: 'result.json'
    }];
}