import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import client from "../../discord/client";
import { removeReactions } from "../../discord/helpers";
import { getGlobal } from '../../utils/global';
import { getUserByName } from "../../utils/mafia/user";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

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
            .description('add a role to a player')
            .argument('<player>', 'which player', fromZod(z.string().min(1).max(100)))
            .requiredOption('--role <name>', 'which role to add', fromZod(z.string().min(1).max(100)))
            .requiredOption('--server <name>', 'which server to add role', fromZod(z.union([z.literal('primary'), z.literal('secondary'), z.literal('tertiary')])))
            .option('--remove', 'whether to remove this role instead');
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') { 
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();

        const player = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');
        if(player == null) throw new Error("Choose a player.");
        const user = await getUserByName(player);
        if(!user) throw new Error("Player not found.");

        const server = interaction.type == 'text' ? interaction.program.getOptionValue("server") as string : interaction.options.getString('server');
        if(server == null || !(server == 'primary' || server == 'secondary' || server == 'tertiary')) throw new Error("Must specify server.");
        const guild = setup[server].guild;

        const member = await guild.members.fetch(user.id);

        const roleName = interaction.type == 'text' ? interaction.program.getOptionValue("role") as string : interaction.options.getString('role');
        if(roleName == null) throw new Error("Musst specify role name!");
        const role = guild.roles.cache.find(cachedRole => cachedRole.name == roleName);
        if(role == undefined) throw new Error("Role not found!");

        const remove = interaction.type == 'text' ? interaction.program.getOptionValue("remove") === true : interaction.options.getBoolean('remove') ?? false;

        const botRole = setup[server].guild.roles.botRoleFor(client.user?.id ?? "---");
        if(botRole == null) throw new Error("Cannot adjust roles on this server!");

        if(role.position > botRole.position) throw new Error("Cannot add/remove roles higher than bot role!");

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