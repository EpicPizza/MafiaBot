import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data } from '../discord';
import client from "../discord/client";
import { firebaseAdmin } from "../utils/firebase";
import { getGlobal } from '../utils/global';
import { refreshSignup } from "../utils/mafia/games";
import { onjoin } from "../utils/mafia/invite";
import { checkSetup, getSetup } from "../utils/setup";
import { getInstance } from "../utils/instance";

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
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("database")
                        .setDescription("Setup database (or resets it if already setup, so DO NOT RUN IF GAME HAS ALREADY STARTED).")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('mod')
                        .setDescription('Setup mod.')
                        .addUserOption(option =>
                            option  
                                .setName('member')
                                .setDescription('Member to spectate.')
                                .setRequired(true)
                        )
                        .addBooleanOption(option =>
                            option
                                .setName('remove')
                                .setDescription('Whether to remove a mod.')
                            
                        )
                )
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
        try {
            const global = await getGlobal();
        
            if(!(global.admin.includes(interaction.user.id))) throw new Error("You're not a mod!");
        } catch(e) {
            if(interaction.user.id != process.env.OWNER) throw new Error("You're not a mod!");
        }

        if(interaction.isChatInputCommand() && interaction.options.getSubcommand() == "database") {
            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings');

            await ref.doc('lock').set({
                increment: false,
                when: null,
                type: false,
                grace: true,
            })

            await ref.doc('grace').set({
                when: null,
                type: false,
            })

            await ref.doc('setup').set({
                primary: {
                    alive: null,
                    chat: null,
                    gang: null,
                    guild: null,
                    mod: null
                },
                secondary: {
                    access: null,
                    archive: null,
                    archivedDms: null,
                    dms: null,
                    guild: null,
                    mod: null,
                    ongoing: null,
                    spec: null,
                    logs: null,
                },
                tertiary: {
                    access: null,
                    archive: null,
                    guild: null,
                    mod: null,
                    ongoing: null,
                    spec: null
                }
            });

            await ref.doc('game').set({
                day: 0,
                game: null,
                locked: false,
                players: [],
                started: false,
                bulletin: null,
                extensions: [],
                grace: false,
                admin: [],
                hammer: true,
            })

            return await interaction.reply({ content: "Database setup.", ephemeral: true });
        }
        
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('settings').doc('setup');

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
            const setup = await checkSetup();

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
                    await interaction.reply({ components: [row], embeds: [embed] })
                }
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('Setup Complete')
                    .setDescription(`
Primary server: https://discord.com/channels/${setup.primary.guild.id}
Secondary server: https://discord.com/channels/${setup.secondary.guild.id}
Tertiary server: https://discord.com/channels/${setup.tertiary.guild.id}

Primary chat channel: https://discord.com/channels/${setup.primary.guild.id}/${setup.primary.chat.id}
Secondary logs channel: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.logs.id}

Secondary ongoing category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.ongoing.id}
Secondary archive category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.archive.id}
Secondary dms category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.dms.id}
Secondary archived dms category: https://discord.com/channels/${setup.secondary.guild.id}/${setup.secondary.archivedDms.id}
Tertiary ongoing category: https://discord.com/channels/${setup.tertiary.guild.id}/${setup.tertiary.ongoing.id}
Tertiary archive category: https://discord.com/channels/${setup.tertiary.guild.id}/${setup.tertiary.archive.id}

Primary mod role: <@&${setup.primary.mod.id}>
Primary alive role: <@&${setup.primary.alive.id}>
Primary gang role: <@&${setup.primary.gang.id}>
Secondary mod role: <@&${setup.secondary.mod.id}>
Secondary spec role: <@&${setup.secondary.spec.id}>
Secondary access role: <@&${setup.secondary.access.id}>
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
                    await interaction.reply({ components: [row], embeds: [embed] })
                }
            }
        } 

        if(!interaction.isChatInputCommand()) return;

        const subcommand = interaction.options.getSubcommand();
        
        if(subcommand == "permissions") {
            await interaction.deferReply({ ephemeral: true });

            const setup = await getSetup();
            const global = await getGlobal();

            if(typeof setup == 'string' || setup == undefined) return await interaction.editReply({ content: setup ? setup : "Something went wrong." });

            if(global.started == false) {
                await setup.primary.chat.permissionOverwrites.create(setup.primary.alive, {});

                await setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
                    ViewChannel: true,
                    SendMessages: true,
                    AddReactions: true,
                    AttachFiles: true,
                    EmbedLinks: true,
                    //SendPolls: true,
                    SendVoiceMessages: true,
                    UseExternalEmojis: true,
                    UseApplicationCommands: true,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false, 
                    SendMessagesInThreads: false
                });
            } else if(global.locked == true) {
                await setup.primary.chat.permissionOverwrites.create(setup.primary.alive, {});

                await setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
                    ViewChannel: true,
                    SendMessages: false,
                    AddReactions: true,
                    AttachFiles: false,
                    EmbedLinks: false,
                    //SendPolls: false,
                    SendVoiceMessages: false,
                    UseExternalEmojis: true,
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
                    //SendPolls: true, 
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
                    //SendPolls: false,
                    SendVoiceMessages: false,
                    UseExternalEmojis: true,
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
        } else if(subcommand == "mod") {
            await interaction.deferReply({ ephemeral: true });

            const setup = await getSetup();

            if(typeof setup == 'string') throw new Error("Setup Incomplete");

            const mod = interaction.options.getUser('member');
            const remove = interaction.options.getBoolean('remove') ?? false;

            if(mod == undefined) throw new Error("A member must be specified");

            const dm = await client.users.cache.get(mod.id)?.createDM();

            if(!dm) throw new Error("Unable to send dms to " + mod.displayName + ".");

            const main = await setup.primary.guild.members.fetch(mod.id).catch(() => undefined);

            if(main == undefined) throw new Error("Member not found.");

            if(remove == false) {
                await main.roles.add(setup.primary.mod);
                await main.roles.remove(setup.primary.alive);
            } else {
                await main.roles.remove(setup.primary.mod);
                await main.roles.remove(setup.primary.alive);
            }

            let message = "";

            const dead = await setup.secondary.guild.members.fetch(mod.id).catch(() => undefined);

            if(dead == undefined && !remove) {
                const channel = setup.secondary.guild.channels.cache.filter(filter => filter.type == ChannelType.GuildText).at(0);

                if(channel == undefined || channel.type != ChannelType.GuildText) throw new Error("Unable to make invite for dead chat.");

                const invite = await setup.secondary.guild.invites.create(channel, { unique: true });

                await onjoin({
                    id: mod.id,
                    server: "secondary",
                    roles: {
                        add: ["admin", "spectator"],
                        remove: ["access"]
                    }
                });

                message += "Dead Chat: https://discord.com/invite/" + invite.code + "\n";
            } else if(dead != undefined && !remove) {
                await dead.roles.remove(setup.secondary.access);
                await dead.roles.add(setup.secondary.mod);
                await dead.roles.add(setup.secondary.spec);
            } else if(dead != undefined && remove) {
                await dead.roles.remove(setup.secondary.access);
                await dead.roles.remove(setup.secondary.mod);
                await dead.roles.add(setup.secondary.spec);
            }

            const mafia = await setup.tertiary.guild.members.fetch(mod.id).catch(() => undefined);
        
            if(mafia == undefined && !remove) {
                const channel = setup.tertiary.guild.channels.cache.filter(filter => filter.type == ChannelType.GuildText).at(0);

                if(channel == undefined || channel.type != ChannelType.GuildText) throw new Error("Unable to make invite for dead chat.");

                const invite = await setup.tertiary.guild.invites.create(channel, { unique: true });

                await onjoin({
                    id: mod.id,
                    server: "tertiary",
                    roles: {
                        add: ["admin", "spectator"],
                        remove: ["access"]
                    }
                });

                message += "Mafia Chat: https://discord.com/invite/" + invite.code + "\n";
            } else if(mafia != undefined && !remove) {
                await mafia.roles.remove(setup.tertiary.access);
                await mafia.roles.add(setup.tertiary.mod);
                await mafia.roles.add(setup.tertiary.spec);
            } else if(mafia != undefined && remove) {
                await mafia.roles.remove(setup.tertiary.access);
                await mafia.roles.remove(setup.tertiary.mod);
                await mafia.roles.add(setup.tertiary.spec);
            }

            if(remove) {
                await dm.send("You're not a mod anymore, your roles have been adjusted.");
            } else {
                if(message == "") {
                    await dm.send("You're now a mod, your roles have been adjusted.");
                } else {
                    await dm.send("You're now a mod, here are invites to the servers you're not in:\n" + message);
                }
            }

            await interaction.editReply({ content: "Mod has been " + (remove ? "removed" : "added") + ". You may need to rerun this command after a game starts (since invites reset)." });
        }
    } 
}