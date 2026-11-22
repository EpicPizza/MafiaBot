import { Command } from "commander";
import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandStringOption, SlashCommandSubcommandGroupBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { AssetVisibility, assetDisplayMessages, commandGuild, isAssetMod, optionalText, requireAssetMod, respond, respondAll, uploadLimit } from "../../utils/assets";
import { addToGroup, createGroup, deleteGroup, getGroupAssets, getVisibleGroup, getVisibleGroups, groupEmbed, parseAssetList, removeFromGroup, setGroupVisibility } from "../../utils/assetGroups";
import { Subcommand } from "../../utils/subcommands";
import { fromZod, simpleJoin } from "../../utils/text";

const groupOption = (option: SlashCommandStringOption) => option
    .setName('group')
    .setDescription('Which group?')
    .setRequired(true)
    .setAutocomplete(true);

const assetsOption = (description: string) => (option: SlashCommandStringOption) => option
    .setName('assets')
    .setDescription(description)
    .setRequired(true)
    .setAutocomplete(true);

const MOD_ACTIONS = [ 'create', 'add', 'remove', 'delete', 'visibility' ];

export const AssetGroupCommand = {
    name: "group",
    subcommand: true,

    slash: new SlashCommandSubcommandGroupBuilder()
        .setName('group')
        .setDescription('Groups of assets, like every card for one role.')
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('Make a group from a list of assets.')
            .addStringOption(option => option.setName('name').setDescription('Name of the group.').setRequired(true).setMaxLength(64))
            .addStringOption(assetsOption('Assets to include, separated by commas.'))
            .addStringOption(option => option
                .setName('visibility')
                .setDescription('Public: anyone can display it. Private: mods only. Defaults to private.')
                .addChoices({ name: 'private', value: 'private' }, { name: 'public', value: 'public' }))
        )
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add assets to a group.')
            .addStringOption(groupOption)
            .addStringOption(assetsOption('Assets to add, separated by commas.'))
        )
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Take assets out of a group (the assets themselves are kept).')
            .addStringOption(groupOption)
            .addStringOption(assetsOption('Assets to take out, separated by commas.'))
        )
        .addSubcommand(sub => sub
            .setName('delete')
            .setDescription('Delete a group (its assets are kept).')
            .addStringOption(groupOption)
        )
        .addSubcommand(sub => sub
            .setName('display')
            .setDescription('Post every asset in a group.')
            .addStringOption(groupOption)
            .addStringOption(option => option.setName('message').setDescription('Text to post with the assets.').setMaxLength(1800))
            .addBooleanOption(option => option.setName('hidden').setDescription('Only show it to you. Defaults to false.'))
        )
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription("List a group's assets.")
            .addStringOption(groupOption)
        )
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List groups, optionally filtered by name.')
            .addStringOption(option => option.setName('query').setDescription('Part of the group name.'))
        )
        .addSubcommand(sub => sub
            .setName('visibility')
            .setDescription('Make a group public (anyone) or private (mods only).')
            .addStringOption(groupOption)
            .addStringOption(option => option
                .setName('set')
                .setDescription('New visibility.')
                .setRequired(true)
                .addChoices({ name: 'private', value: 'private' }, { name: 'public', value: 'public' }))
        ),
    text: () => {
        const group = new Command()
            .name('group')
            .description('Groups of assets, like every card for one role. Separate asset names with commas.');

        group.command('create')
            .description('Make a group: ?asset group create <name> -a <asset>, <asset>, ...')
            .argument('<name...>', 'name of the group', simpleJoin)
            .requiredOption('-a, --assets <assets...>', 'assets to include, separated by commas')
            .option('-p, --public', 'let anyone display it (default: mods only)');

        group.command('add')
            .description('Add assets: ?asset group add <group> -a <asset>, <asset>, ...')
            .argument('<group...>', 'name of the group', simpleJoin)
            .requiredOption('-a, --assets <assets...>', 'assets to add, separated by commas');

        group.command('remove')
            .description('Take assets out of a group (the assets themselves are kept).')
            .argument('<group...>', 'name of the group', simpleJoin)
            .requiredOption('-a, --assets <assets...>', 'assets to take out, separated by commas');

        group.command('delete')
            .description('Delete a group (its assets are kept).')
            .argument('<group...>', 'name of the group', simpleJoin);

        group.command('display')
            .alias('show')
            .description('Post every asset in a group.')
            .argument('<group...>', 'name of the group', simpleJoin)
            .option('-m, --message <message...>', 'text to post with the assets');

        group.command('info')
            .description("List a group's public assets. Use /asset group info to see private ones.")
            .argument('<group...>', 'name of the group', simpleJoin);

        group.command('list')
            .description('List public groups. Use /asset group list to see private ones.')
            .argument('[query...]', 'part of the group name', simpleJoin);

        group.command('visibility')
            .description('Make a group public (anyone) or private (mods only).')
            .argument('<visibility>', 'public or private', fromZod(z.enum(['public', 'private'])))
            .argument('<group...>', 'name of the group', simpleJoin);

        group.commands.forEach(command => command.exitOverride());

        return group;
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        const instance = interaction.instance;
        const user = interaction.user.id;

        let action: string;
        let sub: Command | undefined;

        if(interaction.type == 'text') {
            const name = interaction.program.args[0];
            sub = interaction.program.commands.find(command => command.name() == name || command.aliases().includes(name));

            if(sub == undefined) throw new Error("Unknown action. Use create, add, remove, delete, display, info, list, or visibility.");

            action = sub.name();
        } else {
            action = interaction.options.getSubcommand();
        }

        if(MOD_ACTIONS.includes(action)) await requireAssetMod(instance, user, commandGuild(interaction));

        if(interaction.type != 'text') await interaction.deferReply({ ephemeral: action == 'display' ? interaction.options.getBoolean('hidden') ?? false : true });

        const text = <T>(index: number) => sub!.processedArgs[index] as T;
        const slash = (name: string) => (interaction as ChatInputCommandInteraction).options.getString(name, true);

        const groupName = () => interaction.type == 'text' ? text<string>(action == 'visibility' ? 1 : 0) : slash('group');
        const assetNames = () => parseAssetList(interaction.type == 'text' ? (sub!.getOptionValue('assets') as string[]).join(" ") : slash('assets'));

        // Text replies are visible to the whole channel, so they never reveal private assets or groups,
        // except display, which mods use to post cards into players' channels.
        const mod = await isAssetMod(instance, user, commandGuild(interaction));
        const showPrivate = mod && (interaction.type != 'text' || action == 'display');

        switch(action) {
            case 'create': {
                const visibility: AssetVisibility = interaction.type == 'text'
                    ? (sub!.getOptionValue('public') ? 'public' : 'private')
                    : (interaction.options.getString('visibility') ?? 'private') as AssetVisibility;

                const group = await createGroup(instance, { name: interaction.type == 'text' ? text<string>(0) : slash('name'), assets: assetNames(), visibility, addedBy: user });

                return await respond(interaction, { embeds: [ groupEmbed(group, await getGroupAssets(instance, group, true), true, "Group created") ] });
            }
            case 'add': {
                const group = await addToGroup(instance, groupName(), assetNames());

                return await respond(interaction, { embeds: [ groupEmbed(group, await getGroupAssets(instance, group, true), true, "Group updated") ] });
            }
            case 'remove': {
                const group = await removeFromGroup(instance, groupName(), assetNames());

                return await respond(interaction, { embeds: [ groupEmbed(group, await getGroupAssets(instance, group, true), true, "Group updated") ] });
            }
            case 'delete': {
                const group = await deleteGroup(instance, groupName());

                return await respond(interaction, { content: `Group **${group.name}** deleted. Its assets were kept.` });
            }
            case 'visibility': {
                const visibility = (interaction.type == 'text' ? text<string>(0) : slash('set')) as AssetVisibility;
                const group = await setGroupVisibility(instance, groupName(), visibility);

                return await respond(interaction, { content: `Group **${group.name}** is now ${group.visibility}.` });
            }
            case 'info': {
                const group = await getVisibleGroup(instance, groupName(), showPrivate);

                return await respond(interaction, { embeds: [ groupEmbed(group, await getGroupAssets(instance, group, showPrivate), showPrivate) ] });
            }
            case 'list': {
                const query = ((interaction.type == 'text' ? optionalText(sub!.processedArgs[0]) : interaction.options.getString('query')) ?? "").trim().toLowerCase();
                const groups = (await getVisibleGroups(instance, showPrivate)).filter(group => group.name.toLowerCase().includes(query));

                const hint = mod && !showPrivate ? "Private groups are hidden; use /asset group list to see them." : undefined;

                if(groups.length == 0) return await respond(interaction, { content: (query ? `No groups matching "${query}".` : "No groups yet.") + (hint ? " " + hint : "") });

                const embed = new EmbedBuilder()
                    .setTitle(`${groups.length} group${groups.length == 1 ? '' : 's'}` + (query ? ` matching "${query}"` : ''))
                    .setColor(Colors.Blurple)
                    .setDescription(groups.slice(0, 50).map(group => `**${group.name}** · ${group.assets.length} asset${group.assets.length == 1 ? '' : 's'}` + (showPrivate && group.visibility == 'private' ? ' · 🔒 private' : '')).join("\n"));

                if(groups.length > 50 || hint) embed.setFooter({ text: [ groups.length > 50 ? `...and ${groups.length - 50} more.` : "", hint ?? "" ].filter(Boolean).join(" ") });

                return await respond(interaction, { embeds: [ embed ] });
            }
            case 'display': {
                const group = await getVisibleGroup(instance, groupName(), showPrivate);
                const assets = await getGroupAssets(instance, group, showPrivate);

                if(assets.length == 0) return await respond(interaction, { content: "This group has no assets." });

                const message = interaction.type == 'text' ? (sub!.getOptionValue('message') as string[] | undefined)?.join(" ") : interaction.options.getString('message') ?? undefined;

                await respondAll(interaction, assetDisplayMessages(assets, message, uploadLimit(interaction)), interaction.type != 'text' && (interaction.options.getBoolean('hidden') ?? false));

                return;
            }
        }
    }
} satisfies Subcommand;
