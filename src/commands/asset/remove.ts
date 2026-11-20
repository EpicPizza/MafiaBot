import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Event, type TextCommand } from '../../discord';
import { commandGuild, removeAsset, requireAssetMod, respond } from "../../utils/assets";
import { Subcommand } from "../../utils/subcommands";
import { simpleJoin } from "../../utils/text";

export const AssetRemoveCommand = {
    name: "remove",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('remove')
        .setDescription('Delete an asset.')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Which asset?')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('remove')
            .alias('delete')
            .description('Delete an asset and its stored file.')
            .argument('<name...>', 'name of the asset', simpleJoin);
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        await requireAssetMod(interaction.instance, interaction.user.id, commandGuild(interaction));

        if(interaction.type != 'text') await interaction.deferReply({ ephemeral: true });

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('name', true);

        const asset = await removeAsset(interaction.instance, name);

        await respond(interaction, { content: `Asset **${asset.name}** removed.` });
    }
} satisfies Subcommand;
