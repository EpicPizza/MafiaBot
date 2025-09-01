import { Command } from "commander";
import { ChannelType, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import client from "../../discord/client";
import { removeReactions } from "../../discord/helpers";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal } from '../../utils/global';
import { getGameByName, refreshSignup, removeSignup } from "../../utils/mafia/games";
import { onjoin } from "../../utils/mafia/invite";
import { getUser } from "../../utils/mafia/user";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";

export const SpectatorCommand = {
    name: "spectator",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('spectator')
        .setDescription('Invite a spectator.')
        .addUserOption(option =>
            option  
                .setName('member')
                .setDescription('Member to add spectator.')
                .setRequired(true)
        )
        .addBooleanOption(option => 
            option 
                .setName('remove')
                .setDescription('If wanted, to remove spectator.')
                .setRequired(false)
        )
        .addBooleanOption(option => 
            option 
                .setName('invite')
                .setDescription('Set true to send invite back to you instead of dm.')
                .setRequired(false)
        ),  
    text: () => {
        return new Command()
            .name('spectator')
            .description('invite a spectator')
            .argument('[@member]', '@ to invite', fromZod(z.string().regex(/^<@\d+>$/, "Not a valid @!")))
            .option('-r, --remove', 'to remove exisiting spectator')
            .option('-i, --invite', 'to send invite back to you instead of dm');
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const db = firebaseAdmin.getFirestore();

        const setup = await getSetup();

        const spectator = interaction.type == 'text' ? (interaction.program.processedArgs[0] as string).substring(2, (interaction.program.processedArgs[0] as string).length - 1) : interaction.options.getUser('member')?.id;

        if(spectator == undefined) throw new Error("A member must be specified");

        const remove = interaction.type == 'text' ? interaction.program.getOptionValue('remove') === true : interaction.options.getBoolean('remove') === true;

        const global = await getGlobal();

        if(global.players.filter(player => player.id == spectator).length > 0) throw new Error("Cannot give/remove spectator to a player.");

        const sendDM = interaction.type == 'text' ? interaction.program.getOptionValue('invite') != true : (interaction.options.getBoolean('invite') == null ? true : interaction.options.getBoolean('invite'));

        const dm = await client.users.cache.get(spectator)?.createDM();

        if(sendDM && !dm) throw new Error("Unable to send dms to <@" + spectator + ">.");

        const main = await setup.primary.guild.members.fetch(spectator).catch(() => undefined);

        if(main == undefined) throw new Error("Member not found.");
        
        await main.roles.remove(setup.primary.alive);

        let message = "";

        const dead = await setup.secondary.guild.members.fetch(spectator).catch(() => undefined);

        if(dead == undefined && remove == false) {
            const channel = setup.secondary.guild.channels.cache.filter(filter => filter.type == ChannelType.GuildText).at(0);

            if(channel == undefined || channel.type != ChannelType.GuildText) throw new Error("Unable to make invite for dead chat.");

            const invite = await setup.secondary.guild.invites.create(channel, { unique: true });

            await onjoin({
                id: spectator,
                server: "secondary",
                roles: {
                    add: ["spectator"],
                    remove: ["access"]
                }
            });

            message += "Dead Chat: https://discord.com/invite/" + invite.code + "\n";
        } else if(dead != undefined) {
            if(remove) {
                if(dead.kickable == false) throw new Error("Unable to kick out of dead chat.");

                await dead.kick();
            } else {
                await dead.roles.remove(setup.secondary.access);
                await dead.roles.add(setup.secondary.spec);
            }
        }

        const mafia = await setup.tertiary.guild.members.fetch(spectator).catch(() => undefined);
    
        if(mafia == undefined && remove == false) {
            const channel = setup.tertiary.guild.channels.cache.filter(filter => filter.type == ChannelType.GuildText).at(0);

            if(channel == undefined || channel.type != ChannelType.GuildText) throw new Error("Unable to make invite for dead chat.");

            const invite = await setup.tertiary.guild.invites.create(channel, { unique: true });

            await onjoin({
                id: spectator,
                server: "tertiary",
                roles: {
                    add: ["spectator"],
                    remove: ["access"]
                }
            });

            message += "Mafia Chat: https://discord.com/invite/" + invite.code + "\n";
        } else if(mafia != undefined) {
            if(remove) {
                if(mafia.kickable == false) throw new Error("Unable to kick out of dead chat.");

                await mafia.kick();
            } else {
                await mafia.roles.remove(setup.tertiary.access);
                await mafia.roles.add(setup.tertiary.spec);
            }
        }

        if(sendDM && dm) {
            if(remove) { 
            // do nothing
            } else if(message == "") {
                await dm.send("You're now a spectator, your roles have been adjusted.");
            } else {
                await dm.send("You're now a spectator, here are invites to the servers you're not in:\n" + message);
            }
        }

        if(interaction.type == 'text') {
            await removeReactions(interaction.message);
           
            if(remove) {
                await interaction.reply("Spectator kicked.");
            } else if(!(sendDM && dm)) {
                await interaction.reply({ content: message + "\n\nSpectator has been added. You may need to rerun this command after a game starts (since invites reset)." });
            } else {
                await interaction.reply({ content: "Spectator has been added. You may need to rerun this command after a game starts (since invites reset)." });
            }
        } else {
            if(remove) {
                await interaction.editReply("Spectator kicked.");
            } else if(!(sendDM && dm)) {
                await interaction.editReply({ content: message + "\n\nSpectator has been added. You may need to rerun this command after a game starts (since invites reset)." });
            } else {
                await interaction.editReply({ content: "Spectator has been added. You may need to rerun this command after a game starts (since invites reset)." });
            }
        }
    
    }
} satisfies Subcommand;


export const KickCommand = {
    name: "kick",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('kick')
        .setDescription('Remove a signup.')
        .addStringOption(option =>
            option  
                .setName('player')
                .setDescription('Nickname or ID of player to kick.')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option  
                .setName('game')
                .setDescription('Name of the game.')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('kick')
            .description('remove a signup')
            .argument('<player>', 'nickname of player', fromZod(z.string().min(1).max(100)))
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)))
    },
    

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.program.processedArgs[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        const value = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');

        if(value == null || value == "") throw new Error("Player must be specified.");

        if(name.length < 2) throw new Error("Member id or nickname too short.");

        const game = await getGameByName(name);

        if(game == null) throw new Error("Game not found.");

        let ping = "";

        for(let i = 0; i < game.signups.length; i++) {
            const user = await getUser(game.signups[i]);

            if(game.signups[i] == value) {
                await removeSignup({ id: value, game: game.name });

                ping = "<@" + value + ">";
            } else if(user?.nickname.toLowerCase() == value.toLowerCase()) {
                await removeSignup({ id: user.id, game: game.name });

                ping = "<@" + user.id + ">"
            }
        }

        if(ping == "") return await interaction.reply({ ephemeral: true, content: "Signup not found." });

        await refreshSignup(game.name);

        return await interaction.reply({ content: ping + " has been kicked from " + game.name + ".", ephemeral: true, allowedMentions: { repliedUser: true } });
    }
} satisfies Subcommand;