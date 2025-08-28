import { ChannelType, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import client, { Command, onjoin, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByID, getGlobal, lockGame, setupPlayer } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, getUserByName, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global } from "../../utils/main";
import { firebaseAdmin } from "../../utils/firebase";
import { FieldValue } from "firebase-admin/firestore";

export const RoleCommand = {
    name: "role",
    description: "?adv role {nickname} {server} {role} {remove}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("role")
            .setDescription("Add a role to a player.")
            .addStringOption(option =>
                option
                    .setName("player")
                    .setDescription("Which player to add.")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
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
                    .setName("role")
                    .setDescription("What role to add.")
                    .setRequired(true)
            )
            .addBooleanOption(option =>
                option
                    .setName("remove")
                    .setDescription("Whether to remove this role.")
            ),
        text: {
            required: [ z.string(), z.union([z.literal('primary'), z.literal('secondary'), z.literal('tertiary')]), z.string() ],
            optional:  [ z.literal('remove') ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') { 
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();

        const player = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('player');
        if(player == null) throw new Error("Choose a player.");
        const user = await getUserByName(player);
        if(!user) throw new Error("Player not found.");

        const server = interaction.type == 'text' ? interaction.arguments[2] as string : interaction.options.getString('server');
        if(server == null || !(server == 'primary' || server == 'secondary' || server == 'tertiary')) throw new Error("Must specify server.");
        const guild = setup[server].guild;

        const member = await guild.members.fetch(user.id);

        const roleName = interaction.type == 'text' ? interaction.arguments[3] as string : interaction.options.getString('role');
        if(roleName == null) throw new Error("Musst specify role name!");
        const role = guild.roles.cache.find(cachedRole => cachedRole.name == roleName.replaceAll("_", " "));
        if(role == undefined) throw new Error("Role not found!");

        const remove = interaction.type == 'text' ? interaction.arguments.length > 4 : interaction.options.getBoolean('remove') ?? false;

        const botRole = setup[server].guild.roles.botRoleFor(client.user?.id ?? "---");
        if(botRole == null) throw new Error("Cannot adjust roles on this server!");

        if(role.position > botRole.position) throw new Error("Cannot add roles higher than bot role!");

        if(remove) {
            await member.roles.remove(role);
        } else {
            await member.roles.add(role);
        }

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Roles adjusted."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
}

export const InviteCommand = {
    name: "invite",
    description: "?adv invite {nickname} {server} {channel}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("invite")
            .setDescription("Create an invite with an option acccompanying role.")
            .addStringOption(option =>
                option
                    .setName("player")
                    .setDescription("Which player to add.")
                    .setRequired(true)
                    .setAutocomplete(true)
            )
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
                    .setName("channel")
                    .setDescription("Channel for invite.")
                    .setRequired(true)
            ),
        text: {
            required: [ z.string(), z.union([z.literal('primary'), z.literal('secondary'), z.literal('tertiary')]), z.string() ],
            optional:  []
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') { 
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();

        const player = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('player');
        if(player == null) throw new Error("Choose a player.");
        const user = await getUserByName(player);
        if(!user) throw new Error("Player not found.");

        const server = interaction.type == 'text' ? interaction.arguments[2] as string : interaction.options.getString('server');
        if(server == null || !(server == 'primary' || server == 'secondary' || server == 'tertiary')) throw new Error("Must specify server.");
        const guild = setup[server].guild;

        const channel = interaction.type == 'text' ? interaction.arguments[3] as string : interaction.options.getString('channel');
        if(channel == null) throw new Error("Channel must be specified.");

        const invite = await guild.invites.create(channel, { unique: true });

        await onjoin({
            id: user.id,
            server: server,
            roles: {}
        });

        const dm = await client.users.cache.get(user.id)?.createDM();

        if(!dm) throw new Error("Unable to send dms to " + user.nickname + ".");

        dm.send("You've been sent an invite: \nhttps://discord.com/invite/" + invite.code);

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Player invited."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
}