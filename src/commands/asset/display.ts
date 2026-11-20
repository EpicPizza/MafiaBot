import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Event, type TextCommand } from '../../discord';
import { commandGuild, getAssetPayload, getVisibleAsset, isAssetMod, respond } from "../../utils/assets";
import { Subcommand } from "../../utils/subcommands";
import { simpleJoin } from "../../utils/text";

export const AssetDisplayCommand = {
    name: "display",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('display')
        .setDescription('Post an asset in this channel.')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Which asset?')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addBooleanOption(option =>
            option
                .setName('hidden')
                .setDescription('Only show it to you. Defaults to false.')
        ),
    text: () => {
        return new Command()
            .name('display')
            .alias('show')
            .description('Post an asset in this channel.')
            .argument('<name...>', 'name of the asset', simpleJoin);
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        if(interaction.type != 'text') await interaction.deferReply({ ephemeral: interaction.options.getBoolean('hidden') ?? false });

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('name', true);

        const mod = await isAssetMod(interaction.instance, interaction.user.id, commandGuild(interaction));
        const asset = await getVisibleAsset(interaction.instance, name, mod);

        await respond(interaction, getAssetPayload(asset));
    }
} satisfies Subcommand;
