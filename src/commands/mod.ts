import { APIActionRowComponent, APIButtonComponent, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, CommandInteraction, ComponentType, EmbedBuilder, Interaction, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel, TextInputBuilder, TextInputStyle } from "discord.js";
import client, { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { createUser, editUser, getUser } from "../utils/user";
import { endGame, getGlobal, getGameByID, getGameByName, setAllignments, startGame, unlockGame, lockGame } from "../utils/main";
import { DateTime, SystemZone, Zone } from 'luxon';
import { getFuture, parse, setFuture } from "../utils/timing";
import { getSetup } from "../utils/setup";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'
import { activateSignup, archiveGame, closeSignups, createGame, getGameSetup, openSignups, refreshSignup, removeSignup } from "../utils/games";
import { register } from "../register";

dnt.plugin(meridiem);

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-mod',
            command: new SlashCommandBuilder()
                .setName('mod')
                .setDescription('Mod only commands.')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('open')
                        .setDescription('Open signups.')
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("close")
                        .setDescription("Close signups.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("signups")
                        .setDescription("Creates sign up button for a new game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("archive")
                        .setDescription("Archives a game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("start")
                        .setDescription("Starts the mafia game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("end")
                        .setDescription("Ends the mafia game.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("lock")
                        .setDescription("Locks the mafia game.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("unlock")
                        .setDescription("Unlocks the mafia game.")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('create')
                        .setDescription("Creates a mafia game.")
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('spectator')
                        .setDescription('Invite a spectator.')
                        .addUserOption(option =>
                            option  
                                .setName('member')
                                .setDescription('Member to add spectator.')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('kick')
                        .setDescription('Remove a signup.')
                        .addStringOption(option =>
                            option  
                                .setName('member')
                                .setDescription('Nickname or ID of member to kick.')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option  
                                .setName('game')
                                .setDescription('Name of the game.')
                                .setRequired(true)
                        )                
                )
                
        },
        {
            type: 'button',
            name: 'button-reactivate',
            command: z.object({
                name: z.literal('reactivate'),
            })
        },
        {
            type: 'button',
            name: 'button-change-alignment',
            command: z.object({
                name: z.literal('change-alignment'),
                id: z.string(),
            })
        },
        {
            type: 'button',
            name: 'button-confirm-alignments',
            command: z.object({
                name: z.literal('confirm-alignments'),
            })
        },
        {
            type: 'select',
            name: 'select-future',
            command: z.object({
                name: z.literal("future"),
                type: z.boolean()
            })
        },
        {
            type: 'button',
            name: 'button-unlock',
            command: z.object({
                name: z.literal("unlock"),
                type: z.boolean(),
                value: z.string()
            })
        }
    ] satisfies Data[],

    execute: async (interaction: Interaction) => {
        const setup  = await getSetup();
        if(typeof setup == 'string') throw new Error("Setup Incomplete");

        const member = await setup.primary.guild.members.fetch(interaction.user.id);

        if(!member?.roles.cache.has(setup.primary.mod.id)) throw new Error("You're not a mod!");

        if(interaction.isChatInputCommand()) {
            const subcommand = interaction.options.getSubcommand();
            const name = interaction.options.getString("game");

            if(subcommand == "open") {
                if(name == null) throw new Error("Game needs to be specified.");

                await openSignups(name);

                await refreshSignup(name);

                if(!interaction.replied) {
                    await interaction.reply({ ephemeral: true, content: "Sign ups opened!" });   
                }
            } else if(subcommand == "create") {
                if(name == null) throw new Error("Game needs to be specified.");

                await createGame(interaction);
            } else if(subcommand == "archive") {
                if(name == null) throw new Error("Game needs to be specified.");

                await archiveGame(interaction, name);
            } else if(subcommand == "close") {
                if(name == null) throw new Error("Game needs to be specified.");

                await closeSignups(name);

                await refreshSignup(name);

                if(!interaction.replied) {
                    await interaction.reply({ ephemeral: true, content: "Sign ups closed!" });   
                }
            } else if(subcommand == "signups") {
                if(name == null) throw new Error("Game needs to be specified.");

                await openSignups(name);

                return await createSignups(interaction, name);
            } else if(subcommand == "start") {
                if(name == null) throw new Error("Game needs to be specified.");

                await startGame(interaction, name);

                await setAllignments();

                //await refreshSignup(name);
            } else if(subcommand == "end") {
                await endGame(interaction);

                //await refreshSignup(name);
            } else if(subcommand == "kick") {
                const value = interaction.options.getString('member');

                if(value == null || value == "") throw new Error("Member must be specified.");

                if(name == null) throw new Error("Game needs to be specified.");

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

                return await interaction.reply({ content: ping + " has been kicked from " + game.name + ".", ephemeral: true });
            } else if(subcommand == "unlock") {
                const global = await getGlobal();

                if(!global.started) throw new Error("Game not started.");
                if(global.day == 0) throw new Error("Setup allignments first.");
                if(!global.locked) throw new Error("Game is already unlocked.");

                await handleLocking(interaction, false);
            } else if(subcommand == "lock") {
                const global = await getGlobal();

                if(!global.started) throw new Error("Game not started.");
                if(global.locked) throw new Error("Game is already locked.");

                await handleLocking(interaction, true);
            } else if(subcommand == "spectator") {
                const db = firebaseAdmin.getFirestore();

                const spectator = interaction.options.getUser('member');

                if(spectator == undefined) throw new Error("A member must be specified");

                const global = await getGlobal();

                if(global.players.filter(player => player.id == spectator.id).length > 0) throw new Error("Cannot give spectator to a player.");


                const dm = await client.users.cache.get(spectator.id)?.createDM();

                if(!dm) throw new Error("Unable to send dms to " + spectator.displayName + ".");

                const main = await setup.primary.guild.members.fetch(spectator.id).catch(() => undefined);

                if(main == undefined) throw new Error("Member not found.");
                
                await main.roles.remove(setup.primary.alive);

                let message = "";

                const dead = await setup.secondary.guild.members.fetch(spectator.id).catch(() => undefined);

                if(dead == undefined) {
                    const channel = setup.secondary.guild.channels.cache.filter(filter => filter.type == ChannelType.GuildText).at(0);

                    if(channel == undefined || channel.type != ChannelType.GuildText) throw new Error("Unable to make invite for dead chat.");

                    const invite = await setup.secondary.guild.invites.create(channel, { unique: true });

                    await db.collection('invites').add({
                        id: spectator.id,
                        type: 'dead-spectate',
                        timestamp: new Date().valueOf(),
                    });

                    message += "Dead Chat: https://discord.com/invite/" + invite.code + "\n";
                } else if(dead != undefined) {
                    await dead.roles.remove(setup.secondary.access);
                    await dead.roles.add(setup.secondary.spec);
                }

                const mafia = await setup.tertiary.guild.members.fetch(spectator.id).catch(() => undefined);
            
                if(mafia == undefined) {
                    const channel = setup.tertiary.guild.channels.cache.filter(filter => filter.type == ChannelType.GuildText).at(0);

                    if(channel == undefined || channel.type != ChannelType.GuildText) throw new Error("Unable to make invite for dead chat.");

                    const invite = await setup.tertiary.guild.invites.create(channel, { unique: true });

                    await db.collection('invites').add({
                        id: spectator.id,
                        type: 'spectate',
                        timestamp: new Date().valueOf(),
                    });

                    message += "Mafia Chat: https://discord.com/invite/" + invite.code + "\n";
                } else {
                    await mafia.roles.remove(setup.tertiary.access);
                    await mafia.roles.add(setup.tertiary.spec);
                }

                if(message == "") {
                    dm.send("You're now a spectator, your roles have been adjusted.");
                } else {
                    dm.send("You're now a spectator, here are invites to the servers you're not in:\n" + message);
                }

                await interaction.reply({ ephemeral: true, content: "Spectator has been added. You may need to rerun this command after a game starts (since invites reset)." });
            
                }
        } else if(interaction.isButton()) {
            const id = JSON.parse(interaction.customId);

            if(id.name == "reactivate") {
                const game = JSON.parse(interaction.customId).game;

                return await createSignups(interaction, game);
            } else if(id.name == "change-alignment") {
                const global = await getGlobal();

                if((global.day != 0 && global.started) || !global.started) throw new Error("Command cannot be run.");

                const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]
                const player = id.id as string;
                let alignment: 'mafia' | 'town' | 'neutral' | null = null;

                for(let i = 0; i < components.length; i++) {
                    for(let j = 0; j < components[i].components.length; j++) {
                        const button = components[i].components[j];

                        if(button.style != ButtonStyle.Link && button.custom_id == interaction.customId) {
                            if(button.style == ButtonStyle.Secondary) {
                                button.style = ButtonStyle.Danger;
                                alignment = 'mafia';
                            } else if(button.style == ButtonStyle.Danger) {
                                button.style = ButtonStyle.Secondary;
                                alignment = null;
                            }
                        }
                    }
                }

                const db = firebaseAdmin.getFirestore();

                const ref = db.collection('settings').doc('game');

                await db.runTransaction(async t => {
                    const global = await getGlobal(t);

                    for(let i = 0; i < global.players.length; i++) {
                        if(global.players[i].id == player) {
                            global.players[i].alignment = alignment;
                        }
                    }

                    t.update(ref, {
                        players: global.players
                    })
                })

                await interaction.update({ components: components });
            } else if(id.name == "confirm-alignments") {                
                const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]

                for(let i = 0; i < components.length; i++) {
                    for(let j = 0; j < components[i].components.length; j++) {
                        const button = components[i].components[j];

                        if(button.style != ButtonStyle.Link && button.label == "Confirm") {
                            components[i].components[j].disabled = true;   
                        }
                    }
                }

                await interaction.update({ components: components });

                const global = await getGlobal();
                const setup = await getSetup();
                const which = await getGameByID(global.game ?? "");
                
                if(typeof setup == 'string') throw new Error("Setup Incomplete");
                if(which == null) throw new Error("Game not found.");

                const gameSetup = await getGameSetup(which, setup);

                for(let i = 0; i < global.players.length; i++) {
                    if(global.players[i].alignment == 'mafia') {
                        const mafiaMember = await setup.tertiary.guild.members.fetch(global.players[i].id).catch(() => undefined);

                        const user = await getUser(global.players[i].id);

                        if(user == undefined || user.channel == null) throw new Error("User not found/setup.");

                        const channel = await setup.secondary.guild.channels.fetch(user.channel).catch(() => null) as TextChannel | null;

                        if(channel == null) throw new Error("Channel not found.");

                        if(mafiaMember?.joinedTimestamp) {
                            await mafiaMember.roles.remove(setup.tertiary.spec);
                            await mafiaMember.roles.add(setup.tertiary.access);

                            await channel.send("You are mafia! \nYou now have access to mafia chat.");
                        } else {
                            const db = firebaseAdmin.getFirestore();

                            await db.collection('invites').add({
                                id: user.id,
                                type: 'mafia',
                                timestamp: new Date().valueOf(),
                            });
                        }
                    }
                }

                const invite = await setup.tertiary.guild.invites.create((await gameSetup).mafia, { unique: true });

                await gameSetup.spec.send("Here is the invite link for mafia server: \nhttps://discord.com/invite/" + invite.code + "\nUse the **/mod unlock** command to start the game when it's ready!");

                await firebaseAdmin.getFirestore().collection('settings').doc('game').update({
                    day: 1,
                });
            } else if(id.name == "unlock") {
                const id = JSON.parse(interaction.customId) as { name: "unlock", value: string, type: boolean };

                const date = id.value == "now" ? "now" : new Date(parseInt(id.value ?? new Date().valueOf()));

                if(date == "now") {
                    await unlockGame(id.type);

                    await interaction.update({
                        components: [],
                        embeds: [],
                        content: "Channel unlocked.",
                    })
                } else {
                    await setFuture(date, id.type, false);

                    await interaction.update({
                        content: "Channel will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
                        components: [],
                        embeds: [],
                    });
    
                    await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
                }
            }
        } else if(interaction.isStringSelectMenu()) {
            const id = JSON.parse(interaction.customId) as { name: "future", type: boolean };

            const value = interaction.values[0];

            const date = value == "now" ? "now" : new Date(parseInt(value ?? new Date().valueOf()));

            if(id.type == false) {
                const embed = new EmbedBuilder()
                    .setTitle("Would like to also advance day once channel unlocks?")
                    .setDescription(date == "now" ? "Channel will be unlocked immediently." : "Channel will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.")
                    .setColor(Colors.Orange)
                    .setFooter({ text: "Game begins at day 1, do not advance if this is the first unlock that starts the game." })

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .setComponents([
                        new ButtonBuilder()
                            .setLabel("Yes")
                            .setStyle(ButtonStyle.Success)
                            .setCustomId(JSON.stringify({ name: "unlock", value: date.valueOf().toString(), type: true })),
                        new ButtonBuilder()
                            .setLabel("No")
                            .setStyle(ButtonStyle.Danger)
                            .setCustomId(JSON.stringify({ name: "unlock", value: date.valueOf().toString(), type: false }))
                    ])

                await interaction.update({
                    embeds: [embed],
                    components: [row],
                })
            } else {
                if(date == "now") {
                    await lockGame();

                    await interaction.update({
                        content: "Channel locked.",
                        components: [],
                        embeds: [],
                    });
                } else {
                    await setFuture(date, false, true);

                    await interaction.update({
                        content: "Channel will lock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
                        components: [],
                        embeds: [],
                    });

                    await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game will lock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
                }
            }
        }
    }
}

async function createSignups(interaction: CommandInteraction | ButtonInteraction, name: string) {
    const global = await getGlobal();
    const game = await getGameByName(name);
    const setup = await getSetup();

    if(global == null || game == null) throw new Error("Could not find game.");
    if(typeof setup == 'string') throw new Error("Setup incomplete.");

    if(setup.primary.chat.id != interaction.channelId) throw new Error("Cannot create signups in this channel.");

    if(global.started) {
        return await interaction.reply({
            content: "You cannot create signups for a game thats already started.",
            ephemeral: true,
        })
    }
    
    const embed = new EmbedBuilder()
        .setTitle("Sign ups for " + game.name + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription("Loading sign ups...");

    const message = (interaction.isButton() ? await interaction.update({
        embeds: [embed],
        fetchReply: true,
        components: [],
    }) : await interaction.reply({
        embeds: [embed],
        fetchReply: true,
    }));

    if(message == undefined || message.guildId == undefined) return;

    await activateSignup({ id: message.id, name: game.name });
}

async function handleLocking(interaction: ChatInputCommandInteraction, type: boolean) {
    await interaction.deferReply({ ephemeral: true });

    const timing = await getFuture();

    const embed = new EmbedBuilder()
        .setTitle('Choose a time to ' + (type ? "lock" : "unlock") + " channel.")
        .setColor(Colors.Orange)
        .setDescription("Options are in PST." + (timing ? "\n\nThis will overwrite current " + (timing.type ? "lock" : "unlock") + " at <t:" + Math.round(timing.when.valueOf() / 1000) + ":T>, <t:" + Math.round(timing.when.valueOf() / 1000) + ":d>." : " "))

    let date = DateTime.now().setZone('US/Pacific').startOf("hour");

    //dnt.format(date, "h:mm A, M/DD/YY")

    const select = new StringSelectMenuBuilder()
        .setCustomId(JSON.stringify({ name: "future", type: type }))
        .setPlaceholder('When to ' + (type ? "lock" : "unlock") + " channel?")
        .setOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Now")
                .setDescription((type ? "Lock" : "Unlock") + " the channel now.")
                .setValue("now"),
        )

    for(let i = 0; i < 24; i++) {
        date = date.plus({ hours: 1 });

        if(date.hour > 22) {
            date = date.set({ hour: 10 });
            date = date.plus({ days: 1 });
        } else if(date.hour < 10) {
            date = date.set({ hour: 10 });
        }

        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(date.toFormat("h:mm a, L/d/yy"))
                .setDescription((type ? "Lock" : "Unlock") + " the channel " + date.toFormat("h:mm a, L/d/yy") + ".")
                .setValue(date.valueOf().toString())
        )
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(select)

    await interaction.editReply({
        embeds: [embed],
        components: [row]
    })
}