import { BitField, ChannelType, ChatInputCommandInteraction, GuildBasedChannel, PermissionsBitField, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { Subcommand } from "../../utils/subcommands";
import { Command } from "commander";
import { Event, TextCommand } from "../../discord";
import { getSetup } from "../../utils/setup";
import { fromJSON } from "../../api/spoof";

export const ChannelCommand = {
    name: "channel",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("channel")
        .setDescription("Get info about a channel.")
        .addStringOption(option =>
            option
                .setName("server")
                .setDescription("Which server to add role.")
                .setRequired(true)
                .addChoices(
                    { name: 'primary', value: 'primary' },
                    { name: 'secondary', value: 'secondary' },
                    { name: 'tertiary', value: 'tertiary' },
                )
        )
         .addStringOption(option =>
            option
                .setName('channel')
                .setDescription('Id of channel to get info about.')
                .setRequired(true)
        ),
    text: () => {
        return new Command()
            .name('channel')
            .description('get info about a channel')
            .argument('<server>', 'which server')
            .argument('<channel>', 'id of channel');
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const setup = interaction.instance.setup;

        let channel: undefined | GuildBasedChannel;

        if(interaction.type == 'text') {
            const server = interaction.program.processedArgs[0];
            if(!(server == 'primary' || server == 'secondary' || server == 'tertiary')) throw new Error("Invalid server!");

            const guild = setup[server as 'primary' | 'secondary' | 'tertiary'].guild;

            channel = await guild.channels.fetch(interaction.program.processedArgs[1], { cache: true }) ?? undefined;
        } else {
            const server = interaction.options.getString('server');
            if(!(server == 'primary' || server == 'secondary' || server == 'tertiary')) throw new Error("Invalid server!");

            const guild = setup[server as 'primary' | 'secondary' | 'tertiary'].guild;

            channel = await guild.channels.fetch(interaction.options.getString('channel') ?? "---", { cache: true }) ?? undefined;
        }

        if(channel == undefined || !(channel.type == ChannelType.GuildText || channel.type == ChannelType.GuildCategory)) throw new Error("Unable to find channel!");

        

        await interaction.reply({
            files: fromJSON({ 
                ... channel.toJSON() as unknown as Object, 
                permissionOverwrites: channel.permissionOverwrites.cache.map(permission => ({
                    ...permission.toJSON() as unknown as Object,
                    allow: permission.allow.toArray(),
                    deny: permission.deny.toArray(),
                }))
            }),
        });
    }
} satisfies Subcommand;