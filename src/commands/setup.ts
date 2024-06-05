import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Collection, Colors, CommandInteraction, EmbedBuilder, PermissionFlagsBits, PermissionOverwriteManager, PermissionOverwriteOptions, PermissionOverwriteResolvable, PermissionOverwrites, PermissionsBitField, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import client, { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { getGame, refreshSignup } from "../utils/game";
import { getUser } from "../utils/user";
import { getPartialSetup, getSetup } from "../utils/setup";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-setup',
            command: new SlashCommandBuilder()
                .setName('setup')
                .setDescription('Setup commands for mafia bot.')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('check')
                        .setDescription('Checks that all roles, channels, and servers have been specified.')
                )
                /*.addSubcommand(subcommand =>
                    subcommand
                        .setName("role")
                        .setDescription("Set a role.")
                        .addStringOption(option =>
                            option
                                .setName("which")
                                .setDescription("Which role are you setting?")
                                .setChoices([
                                    { name: "Primary Mod", value: "priMod" },
                                    { name: "Secondary Mod", value: "secMod" },
                                    { name: "Tertiary Mod", value: "terMod" },
                                    { name: "Primary Gang", value: "priGang" },
                                    { name: "Primary Alive", value: "priAlive" },
                                    { name: "Secondary Spec", value: "secApec" },
                                    { name: "Tertiary Spec", value: "terSpec" },
                                    { name: "Tertiary Access", value: "terAccess" },
                                ])
                                .setRequired(true)
                        )
                        .addRoleOption(option => 
                            option  
                                .setName("role")
                                .setDescription("Role to set.")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("channel")
                        .setDescription("Set a channel.")
                        .addStringOption(option =>
                            option
                                .setName("which")
                                .setDescription("Which channel are you setting?")
                                .setChoices([
                                    { name: "Primary Chat", value: "priChat" },
                                    { name: "Secondary DMs", value: "secDms" },
                                    { name: "Secondary Ongoing", value: "secOngoing" },
                                    { name: "Secondary Archive", value: "secArchive" },
                                    { name: "Tertiary Ongoing", value: "terOngoing" },
                                    { name: "Tertiary Archive", value: "terArchive" },
                                ])
                                .setRequired(true)
                        )
                        .addChannelOption(option => 
                            option  
                                .setName("channel")
                                .setDescription("Channel to set.")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("server")
                        .setDescription("Set a server.")
                        .addStringOption(option =>
                            option
                                .setName("which")
                                .setDescription("Which server are you setting?")
                                .setChoices([
                                    { name: "Primary", value: "pri" },
                                    { name: "Secondary", value: "sec" },
                                    { name: "Tertiary", value: "ter" },
                                ])
                                .setRequired(true)
                        )
                )*/
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("permissions")
                        .setDescription("Refresh permissions.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("refresh")
                        .setDescription("Refresh signups.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        },
        {
            type: 'button',
            name: 'button-setup-retry',
            command: z.object({
                name: z.literal('setup-retry')
            })
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | ButtonInteraction) => {

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('setup');

        /*if(subcommand == "role") {
            const role = interaction.options.getRole("role");
            const which = interaction.options.getString("which");

            if(role == null || which == null) return;

            const setup = await getPartialSetup();

            if(which.length < 5) return;

            switch(which.substring(0, 3)) {
                case "pri":
                    if(setup.primary.guild == null) return await interaction.reply({ ephemeral: true, content: "Setup primary server first." });
                    if(setup.primary.guild != interaction.guildId) return await interaction.reply({ ephemeral: true, content: "Wrong server." });

                    switch(which.substring(3, which.length).toLowerCase()) {
                        case "alive":
                        case "mod":
                        case "gang":
                            await ref.update({
                                ["primary." + which.substring(3, which.length).toLowerCase()]: role.id,
                            })
                            break;
                    }
                    break; 
                case "sec":
                    if(setup.secondary.guild == null) return await interaction.reply({ ephemeral: true, content: "Setup secondary server first." });
                    if(setup.secondary.guild != interaction.guildId) return await interaction.reply({ ephemeral: true, content: "Wrong server." });
                    
                    switch(which.substring(3, which.length).toLowerCase()) {
                        case "spec":
                        case "mod":
                            await ref.update({
                                ["secondary." + which.substring(3, which.length).toLowerCase()]: role.id,
                            })
                            break;
                    }
                    break; 
                case "ter":
                    if(setup.tertiary.guild == null) return await interaction.reply({ ephemeral: true, content: "Setup tertiary server first." });
                    if(setup.tertiary.guild != interaction.guildId) return await interaction.reply({ ephemeral: true, content: "Wrong server." });
                    
                    switch(which.substring(3, which.length).toLowerCase()) {
                        case "mod":
                        case "spec":
                        case "access":
                            await ref.update({
                                ["tertiary." + which.substring(3, which.length).toLowerCase()]: role.id,
                            })
                            break;
                    }
                    break; 
            }

            await interaction.reply({ ephemeral: true, content: "Role set." });
        } else */
        
        if(interaction.isChatInputCommand() ? interaction.options.getSubcommand() == "check" : JSON.parse(interaction.customId).name == "setup-retry") {
            const setup = await getSetup();

            if(typeof setup == 'string') {
                const embed = new EmbedBuilder()
                    .setTitle('Incomplete Setup')
                    .setDescription(setup)
                    .setColor(Colors.Red)

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents([
                        new ButtonBuilder()
                            .setCustomId(JSON.stringify({ name: "setup-retry" }))
                            .setStyle(ButtonStyle.Primary)
                            .setLabel("Retry")
                    ])

                if(interaction.isButton()) {
                    await interaction.update({ components: [row], embeds: [embed] })
                } else {
                    await interaction.reply({ ephemeral: true, components: [row], embeds: [embed] })
                }
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('Setup Complete')
                    .setDescription(`
Primary server: https://discord.com/channels/${setup.primary.guild.id}
Secondary server: https://discord.com/channels/${setup.secondary.guild.id}
Tertiary server: https://discord.com/channels/${setup.tertiary.guild.id}

Primary chat channel: https://discord.com/channels/${setup.primary.guild.id}/${setup.primary.chat.id}

Secondary ongoing category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.ongoing.id}
Secondary archive category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.archive.id}
Secondary dms category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.dms.id}
Secondary archived dms category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.archivedDms.id}
Tertiary ongoing category: https://discord.com/channels/${setup.tertiary.guild.id}/${setup.tertiary.ongoing.id}
Tertiary archive category: https://discord.com/channels/${setup.tertiary.guild.id}/${setup.tertiary.archive.id}

Primary mod role: <@&${setup.primary.mod.id}>
Primary mod alive: <@&${setup.primary.alive.id}>
Primary mod gang: <@&${setup.primary.gang.id}>
Secondary mod role: <@&${setup.secondary.mod.id}>
Secondary spec role: <@&${setup.secondary.spec.id}>
Tertiary mod role: <@&${setup.tertiary.mod.id}>
Tertiary spec role: <@&${setup.tertiary.spec.id}>
Tertiary access role: <@&${setup.tertiary.access.id}>
                    `)
                    .setFooter({ text: 'Some links or roles may not be displayed correctly, run command in other servers to check.' })
                    .setColor(Colors.Green)

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents([
                        new ButtonBuilder()
                            .setCustomId(JSON.stringify({ name: "setup-retry" }))
                            .setStyle(ButtonStyle.Primary)
                            .setLabel("Refresh")
                    ])

                if(interaction.isButton()) {
                    await interaction.update({ embeds: [embed], components: [row] })
                } else {
                    await interaction.reply({ ephemeral: true, components: [row], embeds: [embed] })
                }
            }
        } 

        if(!interaction.isChatInputCommand()) return;

        const subcommand = interaction.options.getSubcommand();
        
        if(subcommand == "permissions") {
            await interaction.deferReply({ ephemeral: true });

            const setup = await getSetup();
            const game = await getGame();

            if(typeof setup == 'string' || setup == undefined) return await interaction.editReply({ content: setup ? setup : "Something went wrong." });

            if(game.started == false) {
                await setup.primary.chat.permissionOverwrites.create(setup.primary.alive, {});

                await setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
                    ViewChannel: true,
                    SendMessages: true,
                    AddReactions: true,
                    AttachFiles: true,
                    EmbedLinks: true,
                    SendPolls: true,
                    SendVoiceMessages: true,
                    UseExternalEmojis: true,
                    UseApplicationCommands: true,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false, 
                    SendMessagesInThreads: false
                });
            } else if(game.locked == true) {
                await setup.primary.chat.permissionOverwrites.create(setup.primary.alive, {});

                await setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
                    ViewChannel: true,
                    SendMessages: false,
                    AddReactions: true,
                    AttachFiles: false,
                    EmbedLinks: false,
                    SendPolls: false,
                    SendVoiceMessages: false,
                    UseExternalEmojis: false,
                    UseApplicationCommands: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false, 
                    SendMessagesInThreads: false
                });
            } else {
                await setup.primary.chat.permissionOverwrites.create(setup.primary.alive, {
                    SendMessages: true,
                    AddReactions: true, 
                    AttachFiles: true, 
                    EmbedLinks: true, 
                    SendPolls: true, 
                    SendVoiceMessages: true,
                    UseExternalEmojis: true,
                    SendTTSMessages: false,
                    UseApplicationCommands: true,
                });
            
                await setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
                    ViewChannel: true,
                    SendMessages: false,
                    AddReactions: true,
                    AttachFiles: false,
                    EmbedLinks: false,
                    SendPolls: false,
                    SendVoiceMessages: false,
                    UseExternalEmojis: false,
                    UseApplicationCommands: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false, 
                    SendMessagesInThreads: false
                });
            }

            await interaction.editReply({ content: "Permissions Refreshed" });
        } else if(subcommand == "refresh") {
            await refreshSignup(interaction.options.getString("game") ?? "12948201380912840192380192840912830912803921312");

            await interaction.reply({ ephemeral: true, content: "Signups refreshed." });
        }
    } 
}