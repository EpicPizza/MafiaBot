import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { commandGuild, requireAssetMod, addAsset, AssetSource, AssetVisibility, assetEmbed, findMessageAttachment, respond, sourceFromAttachment, sourceFromUrl } from "../../utils/assets";
import { Subcommand } from "../../utils/subcommands";
import { fromZod, simpleJoin } from "../../utils/text";

export const AssetAddCommand = {
    name: "add",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('add')
        .setDescription('Store an image or video as an asset.')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Name of the asset.')
                .setRequired(true)
                .setMaxLength(64)
        )
        .addAttachmentOption(option =>
            option
                .setName('file')
                .setDescription('The image or video to store.')
        )
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('Link to the image or video to store (instead of a file).')
        )
        .addStringOption(option =>
            option
                .setName('visibility')
                .setDescription('Public: anyone can display it. Private: mods only. Defaults to private.')
                .addChoices(
                    { name: 'private', value: 'private' },
                    { name: 'public', value: 'public' },
                )
        ),
    text: () => {
        return new Command()
            .name('add')
            .description('Store an image or video as an asset. Attach the file, reply to a message with one, or pass --url.')
            .argument('<name...>', 'name of the asset', simpleJoin)
            .option('-p, --public', 'let anyone display or search it (default: mods only)')
            .option('-u, --url <url>', 'link to the file instead of an attachment', fromZod(z.string().url()));
    },

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        await requireAssetMod(interaction.instance, interaction.user.id, commandGuild(interaction));

        let name: string;
        let visibility: AssetVisibility;
        let source: AssetSource | undefined;

        if(interaction.type == 'text') {
            name = interaction.program.processedArgs[0] as string;
            visibility = interaction.program.getOptionValue('public') ? 'public' : 'private';

            const url = interaction.program.getOptionValue('url') as string | undefined;
            const attachment = await findMessageAttachment(interaction.message);

            source = url ? sourceFromUrl(url) : attachment ? sourceFromAttachment(attachment) : undefined;
        } else {
            await interaction.deferReply({ ephemeral: true });

            name = interaction.options.getString('name', true);
            visibility = (interaction.options.getString('visibility') ?? 'private') as AssetVisibility;

            const url = interaction.options.getString('url');
            const attachment = interaction.options.getAttachment('file');

            source = attachment ? sourceFromAttachment(attachment) : url ? sourceFromUrl(url) : undefined;
        }

        if(source == undefined) throw new Error("No file found. Attach one, reply to a message with one, or provide a URL.");

        const asset = await addAsset(interaction.instance, { name, addedBy: interaction.user.id, visibility, source });

        await respond(interaction, { embeds: [ assetEmbed(asset, "Asset added") ] });
    }
} satisfies Subcommand;
