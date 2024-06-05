import { APIActionRowComponent, APIButtonComponent, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, CommandInteraction, ComponentType, EmbedBuilder, Interaction, ModalBuilder, ModalSubmitInteraction, SlashCommandBuilder, SlashCommandSubcommandBuilder, TextChannel, TextInputBuilder, TextInputStyle } from "discord.js";
import client, { Data } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { createUser, editUser, getUser } from "../utils/user";
import { activateSignup, archiveGame, closeSignups, createGame, endGame, getGame, getGameByID, getGameByName, getGameSetup, lockGame, openSignups, refreshSignup, setAllignments, startGame, unlockGame } from "../utils/game";
import { DateTime, Zone } from 'luxon';
import { parse, setFutureLock } from "../utils/timing";
import { getSetup } from "../utils/setup";
import dnt from 'date-and-time';
import meridiem from 'date-and-time/plugin/meridiem'

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
                        .addBooleanOption(option =>
                            option
                                .setName("advance")
                                .setRequired(true)
                                .setDescription("Go to next day?")
                        )
                        .addStringOption(option =>
                            option
                                .setName("when")
                                .setRequired(true)
                                .setDescription("When to unlock? Enter \"now\" for imediently.")
                        )
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
        }
    ] satisfies Data[],

    execute: async (interaction: Interaction) => {
        const setup  = await getSetup();
        if(typeof setup == 'string') throw new Error("Setup Incomplete");

        if(setup.primary.mod.members.get(interaction.user.id) == undefined) throw new Error("You're not a mod!");
        

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

                await startGame(interaction, name, true);

                await setAllignments();

                //await refreshSignup(name);
            } else if(subcommand == "end") {
                await endGame(interaction);

                //await refreshSignup(name);
            } else if(subcommand == "unlock") {
                const game = await getGame();

                if(!game.started) throw new Error("Game not started.");
                if(game.day == 0) throw new Error("Setup allignments first.");

                const increment = interaction.options.getBoolean('advance') ?? false;
                const when = interaction.options.getString("when") ?? "now";

                if(when == "now") {
                    await unlockGame(increment);

                    await interaction.reply({ ephemeral: true, content: "Game unlocked!" });
                } else {
                    const date = parse(when);

                    await setFutureLock(date, increment);

                    await interaction.reply({ content: "Game will unlock at " + dnt.format(date, "h:mm A, M/DD/YY") + "." });
                }
            } else if(subcommand == "lock") {
                await lockGame();

                if(!interaction.replied) {
                    await interaction.reply({ ephemeral: true, content: "Game locked!" });   
                }
            } else if(subcommand == "spectator") {
                const db = firebaseAdmin.getFirestore();

                const spectator = interaction.options.getUser('member');

                if(spectator == undefined) throw new Error("A member must be specified");

                const game = await getGame();

                if(game.players.filter(player => player.id == spectator.id).length > 0) throw new Error("Cannot give spectator to a player.");


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

                    const invite = await setup.secondary.guild.invites.create(channel, { maxUses: 1 });

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

                    const invite = await setup.tertiary.guild.invites.create(channel, { maxUses: 1 });

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

                await interaction.reply({ ephemeral: true, content: "Spectator has been added." });
            
                }
        } else if(interaction.isButton()) {
            const id = JSON.parse(interaction.customId);

            if(id.name == "reactivate") {
                const game = JSON.parse(interaction.customId).game;

                return await createSignups(interaction, game);
            } else if(id.name == "change-alignment") {
                const game = await getGame();

                if((game.day != 0 && game.started) || !game.started) throw new Error("Command cannot be run.");

                const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]
                const player = id.id as string;
                let alignment: 'mafia' | 'town' | 'neutral' | null = null;

                for(let i = 0; i < components.length; i++) {
                    for(let j = 0; j < components[i].components.length; j++) {
                        const button = components[i].components[j];

                        if(button.style != ButtonStyle.Link && button.custom_id == interaction.customId) {
                            if(button.style == ButtonStyle.Success) {
                                button.style = ButtonStyle.Primary;
                                alignment = 'neutral';
                            } else if(button.style == ButtonStyle.Primary) {
                                button.style = ButtonStyle.Danger;
                                alignment = 'mafia';
                            } else if(button.style == ButtonStyle.Danger) {
                                button.style = ButtonStyle.Secondary;
                                alignment = null;
                            } else {
                                button.style = ButtonStyle.Success;
                                alignment = 'town';
                            }
                        }
                    }
                }

                const db = firebaseAdmin.getFirestore();

                const ref = db.collection('settings').doc('game');

                await db.runTransaction(async t => {
                    const game = await getGame(t);

                    for(let i = 0; i < game.players.length; i++) {
                        if(game.players[i].id == player) {
                            game.players[i].alignment = alignment;
                        }
                    }

                    t.update(ref, {
                        players: game.players
                    })
                })

                await interaction.update({ components: components });
            } else if(id.name == "confirm-alignments") {
                const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]

                for(let i = 0; i < components.length; i++) {
                    for(let j = 0; j < components[i].components.length; j++) {
                        const button = components[i].components[j];

                        if(button.style != ButtonStyle.Link && button.custom_id == interaction.customId) {
                            button.disabled = true;   
                        }
                    }
                }

                const game = await getGame();
                const setup = await getSetup();
                const which = await getGameByID(game.game ?? "");
                
                if(typeof setup == 'string') throw new Error("Setup Incomplete");
                if(which == null) throw new Error("Game not found.");

                const gameSetup = getGameSetup(which, setup);

                for(let i = 0; i < game.players.length; i++) {
                    if(game.players[i].alignment == 'mafia') {
                        const mafiaMember = await setup.tertiary.guild.members.fetch(game.players[i].id).catch(() => undefined);

                        const user = await getUser(game.players[i].id);

                        if(user == undefined || user.channel == null) throw new Error("User not found/setup.");

                        const channel = await setup.secondary.guild.channels.fetch(user.channel).catch(() => null) as TextChannel | null;

                        if(channel == null) throw new Error("Channel not found.");

                        if(mafiaMember?.joinedTimestamp) {
                            await mafiaMember.roles.remove(setup.tertiary.spec);
                            await mafiaMember.roles.add(setup.tertiary.access);

                            await channel.send("You are mafia! \nYou now have access to mafia chat.");
                        } else {
                            const invite = await setup.tertiary.guild.invites.create((await gameSetup).mafia, { maxUses: 1 });

                            const db = firebaseAdmin.getFirestore();

                            await db.collection('invites').add({
                                id: user.id,
                                type: 'mafia',
                                timestamp: new Date().valueOf(),
                            });

                            await channel.send("You are mafia! \nhttps://discord.com/invite/" + invite.code);
                        }
                    }
                }

                await firebaseAdmin.getFirestore().collection('settings').doc('game').update({
                    day: 1,
                })

                await interaction.update({ components: components });
            }
        }
    }
}

async function createSignups(interaction: CommandInteraction | ButtonInteraction, name: string) {
    const main = await getGame();
    const game = await getGameByName(name);
    const setup = await getSetup();

    if(main == null || game == null) throw new Error("Could not find game.");
    if(typeof setup == 'string') throw new Error("Setup incomplete.");

    if(setup.primary.chat.id != interaction.channelId) throw new Error("Cannot create signups in this channel.");

    if(main.started) {
        return await interaction.reply({
            content: "You cannot create signups for a game thats already started.",
            ephemeral: true,
        })
    }
    
    const embed = new EmbedBuilder()
        .setTitle("Sign ups for " + game.name + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription("Loading sign ups...");

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            [
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "sign-up", game: game.name }))
                    .setLabel("Sign Up")
                    .setStyle(game.closed ? ButtonStyle.Danger : ButtonStyle.Primary)
                    .setDisabled(game.closed)
            ]
        )

    const message = (interaction.isButton() ? await interaction.update({
        components: [row],
        embeds: [embed],
        fetchReply: true,
    }) : await interaction.reply({
        components: [row],
        embeds: [embed],
        fetchReply: true,
    }));

    if(message == undefined || message.guildId == undefined) return;

    await activateSignup({ id: message.id, name: game.name });
}