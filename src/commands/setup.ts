import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Collection, Colors, CommandInteraction, EmbedBuilder, PermissionFlagsBits, PermissionOverwriteManager, PermissionOverwriteOptions, PermissionOverwriteResolvable, PermissionOverwrites, PermissionsBitField, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import client, { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { activateSignup, addPlayer, getGame, refreshSignup, removePlayer } from "../utils/game";
import { getUser } from "../utils/user";
import { getSetup } from "../utils/setup";

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
                        .setName("mod")
                        .setDescription("Set game mod role.")
                        .addRoleOption(option =>
                            option
                                .setName("role")
                                .setDescription("What role does game mod have?")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("chat")
                        .setDescription("Set chat channel.")
                        .addChannelOption(option =>
                            option
                                .setName("channel")
                                .setDescription("What chat does mafia take place in?")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("alive")
                        .setDescription("Set alive role.")
                        .addRoleOption(option =>
                            option
                                .setName("role")
                                .setDescription("What role do alive people have?")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("gang")
                        .setDescription("Set gang role.")
                        .addRoleOption(option =>
                            option
                                .setName("role")
                                .setDescription("What role do gang people have?")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("permissions")
                        .setDescription("Refresh permissions.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("refresh")
                        .setDescription("Refresh signups.")
                )
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        },
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        const subcommand = interaction.options.getSubcommand();

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('setup');

        if(subcommand == "mod") {
            const role = interaction.options.getRole("role");

            if(!role) return await interaction.reply({ ephemeral: true, content: "A role must be given." });

            await ref.update({
                gm: role.id
            })

            await interaction.reply({ ephemeral: true, content: "Mafia game mod role set."});
        } else if(subcommand == "alive") {
            const role = interaction.options.getRole("role");

            if(!role) return await interaction.reply({ ephemeral: true, content: "A role must be given." });

            await ref.update({
                alive: role.id
            })

            await interaction.reply({ ephemeral: true, content: "Mafia alive role set."});
        } else if(subcommand == "gang") {
            const role = interaction.options.getRole("role");

            if(!role) return await interaction.reply({ ephemeral: true, content: "A role must be given." });

            await ref.update({
                gang: role.id
            })

            await interaction.reply({ ephemeral: true, content: "Mafia gang role set."});
        } else if(subcommand == "chat") {
            const channel = interaction.options.getChannel("channel");

            if(!channel || interaction.guild == null) return await interaction.reply({ ephemeral: true, content: "A channel must be given." });

            if(!(await interaction.guild.channels.fetch(channel.id))?.isTextBased()) return await interaction.reply({ ephemeral: true, content: "A text based channel must be given." });

            await ref.update({
                chat: channel.id,
                guild: interaction.guild.id,
            })

            await interaction.reply({ ephemeral: true, content: "Mafia chat channel set."});
        } else if(subcommand == "permissions") {
            await interaction.deferReply({ ephemeral: true });

            const setup = await getSetup();

            if(typeof setup == 'string' || setup == undefined) return await interaction.editReply({ content: setup ? setup : "Something went wrong." });

            //big dicsord.js locks stuff so i can't edit all at once
            
            await setup.chat.permissionOverwrites.create(setup.gm, {});
            await setup.chat.permissionOverwrites.create(setup.alive, {});
            await setup.chat.permissionOverwrites.create(setup.gang, {});

            await setup.chat.permissionOverwrites.edit(setup.gm, {
                ManageChannels: true,
                ManageRoles: true,
                ManageWebhooks: true,
                ViewChannel: true,
                SendMessages: true,
                SendTTSMessages: true,
                ManageMessages: true,
                EmbedLinks: true,
                AttachFiles: true,
                ReadMessageHistory: true,
                MentionEveryone: true,
                UseExternalEmojis: true,
                AddReactions: true,
                ManageThreads: true,
                CreatePublicThreads: true,
                CreatePrivateThreads: true,
                SendMessagesInThreads: true,
                UseApplicationCommands: true
            });
        
            await setup.chat.permissionOverwrites.edit(setup.alive, {});

            await setup.chat.permissionOverwrites.edit(setup.gang, {
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

            await interaction.editReply({ content: "Permissions Refreshed" });
        } else if(subcommand == "refresh") {
            await refreshSignup();

            await interaction.reply({ content: "Signups refreshed." });
        }
    } 
}