import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { commandGuild, renameAsset, requireAssetMod, respond } from "../../utils/assets";
import { Subcommand } from "../../utils/subcommands";
import { fromZod, simpleJoin } from "../../utils/text";

export const AssetRenameCommand = {
    name: "rename",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('rename')
        .setDescription('Rename an asset.')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Which asset?')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
                .setName('to')
                .setDescription('New name.')
                .setRequired(true)
                .setMaxLength(64)
        ),
    text: () => {
        return new Command()
            .name('rename')
            .description('Rename an asset. Use quotes for multi-word new names.')
            .requiredOption('-t, --to <name>', 'new name', fromZod(z.string().min(1).max(64)))
            .argument('<name...>', 'current name of the asset', simpleJoin);
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        await requireAssetMod(interaction.instance, interaction.user.id, commandGuild(interaction));

        if(interaction.type != 'text') await interaction.deferReply({ ephemeral: true });

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('name', true);
        const to = interaction.type == 'text' ? interaction.program.getOptionValue('to') as string : interaction.options.getString('to', true);

        const asset = await renameAsset(interaction.instance, name, to);

        await respond(interaction, { content: `Asset renamed to **${asset.name}**.` });
    }
} satisfies Subcommand;
