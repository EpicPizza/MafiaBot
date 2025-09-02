import { ActionRow, ActionRowBuilder, BitField, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, Client, Collection, ComponentType, EmojiIdentifierResolvable, MentionableSelectMenuBuilder, Message, MessageEditOptions, MessageMentions, MessagePayload, MessageReplyOptions, MessageType, RoleSelectMenuBuilder, StringSelectMenuBuilder, User, UserSelectMenuBuilder } from "discord.js";
import { Setup } from "../utils/setup";
import { DiscordSnowflake } from "@sapphire/snowflake";
import client from "../discord/client";

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
        member: await setup.primary.guild.members.fetch(user),
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
    } as unknown as Message<true>;

    return spoofedMessage;
}

export function transform(options: string | MessagePayload | MessageEditOptions | MessageReplyOptions): {
    content: string | null,
    embeds: any[],
    components: any[]
} {
    if(typeof options == 'string') {
        return {
            content: options,
            embeds: [],
            components: [],
        }
    } else if('content' in options || 'embeds' in options || 'components' in options) {
        const components = [] as any[];

        const rows = (options.components ?? []) as unknown as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder | ChannelSelectMenuBuilder | MentionableSelectMenuBuilder | UserSelectMenuBuilder | RoleSelectMenuBuilder>[];
        
        rows.forEach(row => {
            row.components.map(component => component.data).forEach(component => {
                switch(component.type) {
                    case ComponentType.Button:
                        if(component.style == ButtonStyle.Link) {
                            components.push({
                                label: component.label ?? null,
                                url: component.url ?? null,
                                emoji: component.emoji  ?? null,
                                type: "url"
                            });
                        } else if('custom_id' in component) {
                            components.push({
                                label: component.label ?? null,
                                emoji: component.emoji ?? null,
                                customId: component.custom_id ?? null,
                                style: component.style,
                                type: "customId",
                            });
                        }

                        break;
                    default:
                        break;
                }
            })
        });

        return {
            content: options.content ?? null,
            embeds: (options.embeds ?? []).map(embed => {
                if('toJSON' in embed) embed = embed.toJSON();

                return {
                    title: embed.title ?? null,
                    description: embed.description ?? null,
                    url: embed.url ?? null,
                    image: embed.image ?? null,
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
                    fields: (embed.fields ?? []).forEach(field => ({
                        name: field.name,
                        value: field.value,
                        inline: field.inline ?? false,
                    }))
                }
            }),
            components: components,
        }
    }

    return {
        content: null,
        embeds: [],
        components: [],
    }
}