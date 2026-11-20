import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Event, type TextCommand } from '../../discord';
import { commandGuild, getVisibleAsset, isAssetMod, respond } from "../../utils/assets";
import { Subcommand } from "../../utils/subcommands";
import { simpleJoin } from "../../utils/text";

export const AssetUrlCommand = {
    name: "url",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('url')
        .setDescription("Get an asset's link.")
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Which asset?')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('url')
            .alias('link')
            .description("Get a public asset's permanent link without embedding it. Use /asset url for private assets.")
            .argument('<name...>', 'name of the asset', simpleJoin);
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        if(interaction.type != 'text') await interaction.deferReply({ ephemeral: true });

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('name', true);

        // Anyone with the link can open the file, and text replies are visible to the whole channel,
        // so the text command treats private assets as nonexistent, even for mods.
        const mod = interaction.type != 'text' && await isAssetMod(interaction.instance, interaction.user.id, commandGuild(interaction));
        const asset = await getVisibleAsset(interaction.instance, name, mod);

        // Angle brackets stop Discord from embedding the file.
        await respond(interaction, { content: `**${asset.name}**: <${asset.url}>` });
    }
} satisfies Subcommand;
