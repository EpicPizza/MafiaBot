import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Event, type TextCommand } from '../../discord';
import { commandGuild, assetListEmbed, getVisibleAssets, isAssetMod, respond } from "../../utils/assets";
import { Subcommand } from "../../utils/subcommands";
import { simpleJoin } from "../../utils/text";

export const AssetSearchCommand = {
    name: "search",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('search')
        .setDescription('List assets, optionally filtered by name.')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Part of the asset name. Leave empty to list everything.')
        )
        .addBooleanOption(option =>
            option
                .setName('mine')
                .setDescription('Only show assets you added (mods).')
        ),
    text: () => {
        return new Command()
            .name('search')
            .alias('list')
            .description('List public assets, optionally filtered by name. Private assets only show in /asset search, since it replies just to you.')
            .argument('[query...]', 'part of the asset name', simpleJoin)
            .option('-m, --mine', 'only show assets you added');
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        if(interaction.type != 'text') await interaction.deferReply({ ephemeral: true });

        const query = ((interaction.type == 'text' ? interaction.program.processedArgs[0] as string | undefined : interaction.options.getString('query')) ?? "").trim().toLowerCase();
        const mine = interaction.type == 'text' ? interaction.program.getOptionValue('mine') == true : interaction.options.getBoolean('mine') ?? false;

        const mod = await isAssetMod(interaction.instance, interaction.user.id, commandGuild(interaction));

        // Text replies are visible to the whole channel, so they never list private assets.
        const showPrivate = mod && interaction.type != 'text';

        const assets = (await getVisibleAssets(interaction.instance, showPrivate))
            .filter(asset => asset.name.toLowerCase().includes(query))
            .filter(asset => !mine || asset.addedBy == interaction.user.id);

        if(assets.length == 0) return await respond(interaction, { content: (query ? `No assets matching "${query}".` : "No assets yet.") + (mod && !showPrivate ? " Private assets are hidden here; use /asset search to see them." : "") });

        const embed = assetListEmbed(assets, mod, query);

        if(mod && !showPrivate) {
            const footer = embed.data.footer?.text;

            embed.setFooter({ text: (footer ? footer + " " : "") + "Private assets are hidden; use /asset search to see them." });
        }

        await respond(interaction, { embeds: [ embed ] });
    }
} satisfies Subcommand;
