import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { AssetVisibility, commandGuild, requireAssetMod, respond, setAssetVisibility } from "../../utils/assets";
import { Subcommand } from "../../utils/subcommands";
import { fromZod, simpleJoin } from "../../utils/text";

export const AssetVisibilityCommand = {
    name: "visibility",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('visibility')
        .setDescription('Make an asset public (anyone) or private (mods only).')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Which asset?')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
                .setName('set')
                .setDescription('New visibility.')
                .setRequired(true)
                .addChoices(
                    { name: 'public', value: 'public' },
                    { name: 'private', value: 'private' },
                )
        ),
    text: () => {
        return new Command()
            .name('visibility')
            .description('Make an asset public (anyone) or private (mods only).')
            .argument('<visibility>', 'public or private', fromZod(z.enum(['public', 'private'])))
            .argument('<name...>', 'name of the asset', simpleJoin);
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        await requireAssetMod(interaction.instance, interaction.user.id, commandGuild(interaction));

        if(interaction.type != 'text') await interaction.deferReply({ ephemeral: true });

        const visibility = (interaction.type == 'text' ? interaction.program.processedArgs[0] : interaction.options.getString('set', true)) as AssetVisibility;
        const name = interaction.type == 'text' ? interaction.program.processedArgs[1] as string : interaction.options.getString('name', true);

        const asset = await setAssetVisibility(interaction.instance, name, visibility);

        await respond(interaction, { content: `Asset **${asset.name}** is now ${asset.visibility}.` });
    }
} satisfies Subcommand;
