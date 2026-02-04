import { Command } from "commander";
import { ChatInputCommandInteraction, Guild, GuildMember, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import client from "../../discord/client";
import { removeReactions } from "../../discord/helpers";
import { getUserByName } from "../../utils/mafia/user";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const CreateCommand = {
    name: "createrole",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('createrole')
        .setDescription('This command is ignored.'),
    text: () => {
        return new Command()
            .name("createrole")
            .description('create a role')
            .requiredOption('--role <name>', 'which role to add', fromZod(z.string().min(1).max(100)))
            .requiredOption('--server <name>', 'which server to add role', fromZod(z.union([z.literal('primary'), z.literal('secondary'), z.literal('tertiary')])))
            .option('--position <position>', 'which position to set this role to', fromZod(z.coerce.number().min(1).int()))
            .option('--color <hex>', 'which color to set this role to');
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') return;

        const global = interaction.instance.global;
        const setup = interaction.instance.setup;

        if(!global.admin.includes(interaction.user.id)) throw new Error("You don't have permission to do this!");

        const server =interaction.program.getOptionValue("server") as string;
        if(server == null || !(server == 'primary' || server == 'secondary' || server == 'tertiary')) throw new Error("Must specify server.");
        const guild = setup[server].guild;

        const name = interaction.program.getOptionValue("role") as string;
        const position = interaction.program.getOptionValue("position") as number | undefined;
        const color = interaction.program.getOptionValue("color") as string | undefined;

        console.log(guild, name, position, color);

        await guild.roles.create({
            name: name,
            color: color ? `#${color}` : undefined,
            position: position,
        });

        await interaction.reply(`Created role ${name} on ${server}.`);
    }
    
} satisfies Subcommand;

export const RoleCommand = {
    name: "role",
    subcommand: true,

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
    text: () => {
        return new Command()
            .name('role')
            .description('Add a role to a player.')
            .argument('<player>', 'which player', fromZod(z.string().min(1).max(100)))
            .requiredOption('--role <name>', 'which role to add', fromZod(z.string().min(1).max(100)))
            .requiredOption('--server <name>', 'which server to add role', fromZod(z.string()))
            .option('--remove', 'whether to remove this role instead')
            .option('--bypass', 'bypass role hierarchy protections');
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') { 
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = interaction.instance.global;
        const setup  = interaction.instance.setup;

        const player = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');
        if(player == null) throw new Error("Choose a player.");
        const user = await getUserByName(player, interaction.instance);
        if(!user) throw new Error("Player not found.");

        const server = interaction.type == 'text' ? interaction.program.getOptionValue("server") as string : interaction.options.getString('server');
        if(server == null) throw new Error("Must specify server.");
        
        let guild: Guild | undefined;
        if(server == 'primary' || server == 'secondary' || server == 'tertiary') {
            guild = setup[server].guild;
        } else {
            guild = await client.guilds.fetch(server);
        }
        if(guild == undefined) throw new Error("Guild not found.");

        const member = await guild.members.fetch(user.id);

        const roleName = interaction.type == 'text' ? interaction.program.getOptionValue("role") as string : interaction.options.getString('role');
        if(roleName == null) throw new Error("Musst specify role name!");
        const role = guild.roles.cache.find(cachedRole => cachedRole.name == roleName);
        if(role == undefined) throw new Error("Role not found!");

        const remove = interaction.type == 'text' ? interaction.program.getOptionValue("remove") === true : interaction.options.getBoolean('remove') ?? false;

        const bypass = interaction.type == 'text' ? interaction.program.getOptionValue("bypass") === true : false;
        if(bypass && !(global.admin.includes(interaction.user.id))) throw new Error("Bypass not allowed!");

        if(!bypass) {
            const botRole = setup[server].guild.roles.botRoleFor(client.user?.id ?? "---");
            if(botRole == null) throw new Error("Cannot adjust roles on this server!");

            if(role.position > botRole.position && !bypass) throw new Error("Cannot add/remove roles higher than bot role!");
        }

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
} satisfies Subcommand;