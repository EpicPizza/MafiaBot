import { Transaction, FieldValue } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import client from "../discord";
import { ActionRow, BaseGuildTextChannel, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, CommandInteraction, GuildBasedChannel, PermissionsBitField, TextChannel } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { getUser } from "./user";
import { getSetup } from "./setup";
import { z } from "zod";

export async function getGame(t: Transaction | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    const doc = t ? await t.get(ref) : await ref.get();

    const data = doc.data();

    if(data) {
        return data as Game;
    }

    throw new Error("Could not find game on database.");
}

interface Game {
    started: boolean,
    locked: boolean,
    players: Player[]
    day: number,
    game: string | null,
}

interface Player {
    id: string,
    alignment: 'mafia' | 'neutral' | 'town' | null;
}

interface Signups { 
    name: string, 
    signups: string[], 
    id: string,
    closed: boolean,
    message: {
        id: string,
    } | null,
    channels: {
        spec: string,
        mafia: string,
    }
}

export function generateOverwrites(id: string) {
    return [
        {
            id: id,
            allow: [
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.AddReactions, 
                PermissionsBitField.Flags.AttachFiles, 
                PermissionsBitField.Flags.EmbedLinks, 
                PermissionsBitField.Flags.SendPolls, 
                PermissionsBitField.Flags.SendVoiceMessages,
                PermissionsBitField.Flags.UseExternalEmojis,
                PermissionsBitField.Flags.UseApplicationCommands,
            ],
            deny: [
                PermissionsBitField.Flags.SendTTSMessages
            ]
        }
    ] 
}

export function editOverwrites() {
    return {
        SendMessages: true,
        AddReactions: true, 
        AttachFiles: true, 
        EmbedLinks: true, 
        SendPolls: true, 
        SendVoiceMessages: true,
        UseExternalEmojis: true,
        SendTTSMessages: false,
        UseApplicationCommands: true,
    }
}

export async function unlockGame() {
    const game = await getGame();
    const setup = await getSetup();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!game.started) return await setup.primary.chat.send("Failed to unlock channel, game has not started.");
    if(!game.locked) throw new Error("Already unlocked.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: false,
    });

    await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game has unlocked!");

    await setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {
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

    await setup.primary.chat.permissionOverwrites.create(setup.primary.gang.id, {
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

export async function lockGame() {
    const game = await getGame();
    const setup = await getSetup();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!game.started) return await setup.primary.chat.send("Failed to unlock channel, game has not started.");
    if(game.locked) throw new Error("Already locked.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: true,
    });

    await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game has locked!");

    await setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {});

    await setup.primary.chat.permissionOverwrites.create(setup.primary.gang.id, {
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

export async function archiveGame(interaction: ChatInputCommandInteraction, name: string) {
    const setup = await getSetup();
    const game = await getGameByName(name);
    const main = await getGame();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");
    if(game == null || main == null) throw new Error("Game not found.");
    if(main.game == game.id && main.started) throw new Error("Game in progress.");

    const spec = await setup.secondary.guild.channels.fetch(game.channels.spec).catch(() => undefined);
    if(spec != undefined && spec.type == ChannelType.GuildText) await spec.setParent(setup.secondary.archive, { lockPermissions: true });

    const mafia = await setup.tertiary.guild.channels.fetch(game.channels.mafia).catch(() => undefined);
    if(mafia != undefined && mafia.type == ChannelType.GuildText) await mafia.setParent(setup.tertiary.archive, { lockPermissions: true });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.delete();

    await db.collection('settings').doc('game').update({
        game: null,
    })

    await interaction.reply({ ephemeral: true, content: "Game archived." });
}

export async function createGame(interaction: ChatInputCommandInteraction) {
    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games');

    const name = interaction.options.getString("game") ? interaction.options.getString("game") as string : "Untitled Game " + getRandom(1, 9) + getRandom(1, 9) + getRandom(1, 9);

    console.log(name);

    const requirements = z.string().max(20, "Max length 20 characters.").regex(/[\p{Letter}\p{Mark}]+/gu, "Only letters and - allowed. No spaces.");

    const check = requirements.safeParse(name);

    if(!check.success) {
        return await interaction.reply({ ephemeral: true, content: "Name Error - " + check.error.message });
    }

    await interaction.deferReply({ ephemeral: true });

    const spec = await setup.secondary.ongoing.children.create({
        type: ChannelType.GuildText,
        name: name.toLowerCase() + "-spectator",
        position: 0,
    });

    const mafia = await setup.tertiary.ongoing.children.create({
        type: ChannelType.GuildText,
        name: name.toLowerCase() + "-mafia",
        position: 0,
    });

    await ref.add({
        signups: [],
        name: name,
        closed: false,
        message: null,
        channels: {
            spec: spec.id,
            mafia: mafia.id,
        }
    });

    await interaction.editReply({ content: name + " game created." })
}

function getRandom(min: number, max: number) {
    return Math.floor((Math.random() * (max - min) + min)).toString();
}

export async function startGame(interaction: ChatInputCommandInteraction, name: string, lock: boolean = false) {
    const game = await getGame();
    const which = await getGameByName(name);
    const setup = await getSetup();

    if(setup == undefined) return await interaction.reply({ ephemeral: true, content: "Setup not complete." });
    if(typeof setup == 'string') return await interaction.reply({ ephemeral: true, content: "An unexpected error occurred." });
    if(game.started) return await interaction.reply({ ephemeral: true, content: "Game has already started." });
    if(which == null) return await interaction.reply({ ephemeral: true, content: "Game not found." });
    if(which.signups.length == 0) return await interaction.reply({ ephemeral: true, content: "Game must have more than one player." });

    for(let i = 0; i < which.signups.length; i++) { //chances someone is not the server is not zero (cough cough someone cough), check here to prevent game from starting if there is someone missing
        const player = await setup.primary.guild.members.fetch(which.signups[i]).catch(() => undefined);
        if(player == null) throw new Error("Member not found.");
    }

    const gameSetup = await getGameSetup(which, setup);

    await interaction.deferReply({ ephemeral: true });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: lock,
        game: which.id,
        players: which.signups.map((signup) => { return { id: signup, allignment: null } }),
        day: 0,
    });

    await db.collection('settings').doc('game').collection('games').doc(which.id).update({
        closed: true,
    })

    await refreshSignup(which.name);

    if(lock) {
        await setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {});

        await setup.primary.chat.permissionOverwrites.create(setup.primary.gang.id, {
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
        await setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {
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

        await setup.primary.chat.permissionOverwrites.create(setup.primary.gang.id, {
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

    for(let i = 0; i < which.signups.length; i++) {
        const member = await setup.secondary.guild.members.fetch(which.signups[i]).catch(() => undefined);
        const user = await getUser(which.signups[i]);

        const player = await setup.primary.guild.members.fetch(which.signups[i]).catch(() => undefined);
        if(player == null) throw new Error("Member not found.");
        await player.roles.add(setup.primary.alive);

        const mafiaMember = await setup.tertiary.guild.members.fetch(which.signups[i]).catch(() => undefined);
        if(mafiaMember?.joinedTimestamp) {
            await mafiaMember.roles.remove(setup.tertiary.spec);
            await mafiaMember.roles.remove(setup.tertiary.access);
            if(mafiaMember.kickable) {
                await mafiaMember.kick();
            } else {
                gameSetup.mafia.send("Failed to kick <@" + mafiaMember.id + ">.");
            }
        }

        if(user == null) throw new Error("Member not found.");

        if(!member) {
            if(user.channel) {
                const invite = await setup.secondary.guild.invites.create(user.channel, { maxUses: 1 });

                await db.collection('invites').add({
                    id: user.id,
                    type: 'joining',
                    timestamp: new Date().valueOf(),
                });
                
                const dm = await client.users.cache.get(which.signups[i])?.createDM();

                if(!dm) return await gameSetup.spec.send("Unable to send dms to " + user.nickname + ".");

                dm.send("Looks like you left the server! Here's a server invite: \nhttps://discord.com/invite/" + invite.code);
            } else {
                const channel = await setup.secondary.guild.channels.create({ 
                    parent: setup.secondary.dms, 
                    name: user.nickname.toLowerCase()
                })

                await db.collection('users').doc(user.id).update({
                    channel: channel.id,
                });

                const invite = await setup.secondary.guild.invites.create(channel.id, { maxUses: 1 });

                await db.collection('invites').add({
                    id: user.id,
                    type: 'joining',
                    timestamp: new Date().valueOf(),
                });

                const dm = await client.users.cache.get(which.signups[i])?.createDM();

                if(!dm) return await gameSetup.spec.send("Unable to send dms to " + user.nickname + ".");

                dm.send("Join the Dead Chat server to play in mafia! Here's a server invite: \nhttps://discord.com/invite/" + invite.code);
            }
        } else {
            await member.roles.remove(setup.secondary.spec);

            if(user.channel != null) {
                let channel = await setup.secondary.guild.channels.fetch(user.channel).catch(() => undefined);

                if(channel == undefined) {
                    channel = await setup.secondary.guild.channels.create({ 
                        parent: setup.secondary.dms, 
                        name: user.nickname.toLowerCase(),
                        permissionOverwrites: generateOverwrites(user.id)
                    });

                    await db.collection('users').doc(user.id).update({
                        channel: channel.id,
                    });
                } else if(channel.parentId == setup.secondary.archivedDms.id) {
                    await (channel as TextChannel).setParent(setup.secondary.dms.id);
                    await (channel as TextChannel).permissionOverwrites.create(user.id, editOverwrites());
                }
            } else {
                const channel = await setup.secondary.guild.channels.create({ 
                    parent: setup.secondary.dms, 
                    name: user.nickname.toLowerCase(),
                    permissionOverwrites: generateOverwrites(user.id)
                });

                await db.collection('users').doc(user.id).update({
                    channel: channel.id,
                });

                channel.send("Welcome <@" + user.id + ">! Check out pins in main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod.");
            }
        }
    }

    await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game has started!");

    return await interaction.editReply({ content: "Game has started!" });
}

export async function getGameSetup(game: Signups, setup: Exclude<Awaited<ReturnType<typeof getSetup>>, string>) {
    const db = firebaseAdmin.getFirestore();

    const spec = await setup.secondary.guild.channels.fetch(game.channels.spec).catch(() => undefined);
    const mafia = await setup.tertiary.guild.channels.fetch(game.channels.mafia).catch(() => undefined);

    if(spec == undefined || mafia == undefined) throw new Error("Game Setup Incomplete");
    
    return { spec: spec as TextChannel, mafia: mafia as TextChannel };
}

export async function endGame(interaction: ChatInputCommandInteraction) {
    const game = await getGame();
    const which = await getGameByID(game.game ?? "bruh");
    const setup = await getSetup();

    if(setup == undefined) return await interaction.reply({ ephemeral: true, content: "Setup not complete." });
    if(typeof setup == 'string') return await interaction.reply({ ephemeral: true, content: "An unexpected error occurred." });
    if(!game.started) return await interaction.reply({ ephemeral: true, content: "Game has not started." });
    if(which == null) return await interaction.reply({ ephemeral: true, content: "Game not found." });

    const gameSetup = await getGameSetup(which, setup);

    await interaction.deferReply({ ephemeral: true });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: false,
        locked: false,
    });

    await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game has ended!");

    await setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {});

    await setup.primary.chat.permissionOverwrites.create(setup.primary.gang.id, {
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

    await setup.secondary.guild.channels.fetch();

    const channels: TextChannel[] = [];

    for(let i = 0; i < setup.secondary.dms.children.cache.size; i++) {
        if(setup.secondary.dms.children.cache.at(i)) {
            channels.push(setup.secondary.dms.children.cache.at(i) as TextChannel);
        }
    }

    for(let i = 0; i < channels.length; i++) {
        await channels[i].setParent(setup.secondary.archivedDms, { lockPermissions: true });
    }

    for(let i = 0; i < which.signups.length; i++) {
        const member = await setup.secondary.guild.members.fetch(which.signups[i]).catch(() => undefined);
        const user = await getUser(which.signups[i]);

        const player = await setup.primary.guild.members.fetch(which.signups[i]).catch(() => undefined);
        if(player == null || user == null) throw new Error("Member not found.");
        await player.roles.remove(setup.primary.alive);

        if(member != null) {
            member.roles.add(setup.secondary.spec);
        }

        const mafiaMember = await setup.tertiary.guild.members.fetch(which.signups[i]).catch(() => undefined);
        if(mafiaMember) {
            await mafiaMember.roles.add(setup.tertiary.spec);
            await mafiaMember.roles.remove(setup.tertiary.access);
        } else {
            console.log(setup.tertiary.guild, gameSetup.mafia.id);

            const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia.id, { maxUses: 1 });

            await db.collection('invites').add({
                id: user.id,
                type: 'spectate',
                timestamp: new Date().valueOf(),
            });
                
            const dm = await client.users.cache.get(which.signups[i])?.createDM();

            if(!dm) return await gameSetup.spec.send("Unable to send dms to " + user.nickname + ".");

            dm.send("Here's a server invite to spectate mafia chat: \nhttps://discord.com/invite/" + invite.code);
        }
    }

    return await interaction.editReply({ content: "Game has ended!" });
}

export async function getGameID(name: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').where('name', '==', name);

    const docs = (await ref.get()).docs;

    if(docs.length > 1) throw new Error("Database Error - Multiple games with the same name found.");

    if(docs.length == 0) return null;

    return docs[0].id;
}

export async function getGameByName(name: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').where('name', '==', name);

    const docs = (await ref.get()).docs;

    if(docs.length > 1) throw new Error("Database Error - Multiple games with the same name found.");

    if(docs.length == 0) return null;

    if(docs[0].data() == undefined) throw new Error("Game not found in database.");

    return { ... docs[0].data(), id: docs[0].id } as Signups;
}

export async function getGameByID(id: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(id);

    const doc = (await ref.get());

    if(doc.data() == undefined) throw new Error("Game not found in database.");

    return { ... doc.data(), id: doc.id } as Signups;
}



export async function addSignup(options: { id: string, game: string }) {
    const db = firebaseAdmin.getFirestore();

    const id = await getGameID(options.game);

    if(id == null) return false;

    const ref = db.collection('settings').doc('game').collection('games').doc(id);

    await db.runTransaction(async t => {
        const doc = await t.get(ref);

        const data = doc.data();

        if(data == undefined) return;

        if(!(data.signups as string[]).includes(options.id)) {
            t.update(ref, {
                signups: FieldValue.arrayUnion(options.id)
            })
        }
    });

    return true;
}


export async function removeSignup(options: { id: string, game: string }) {
    const db = firebaseAdmin.getFirestore();

    const id = await getGameID(options.game);

    if(id == null) return false;

    const ref = db.collection('settings').doc('game').collection('games').doc(id);

    await db.runTransaction(async t => {
        const doc = await t.get(ref);

        const data = doc.data();

        if(data == undefined) return;

        t.update(ref, {
            signups: FieldValue.arrayRemove(options.id)
        })
    });

    return true;
}

export async function openSignups(name: string) {
    const game = await getGameByName(name);
    const main = await getGame();

    if(main.started) throw new Error("Game has already started, sign ups are closed.");
    if(game == null) throw new Error("Game not found." )

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.update({
        closed: false,
    })
}

export async function closeSignups(name: string) {
    const game = await getGameByName(name);
    const main = await getGame();

    if(main.started) throw new Error("Game has already started, sign ups are closed.");
    if(game == null) throw new Error("Game not found.")

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.update({
        closed: true,
    })
}

export async function editPlayer(options: { id: string, alignment: 'mafia' | 'neutral' | 'town' | null }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await db.runTransaction(async t => {
        const game = await getGame(t);

        const player = game.players.find((value) => { value.id == options.id });

        if(player) {
            player.alignment = options.alignment;
        }

        t.update(ref, {
            players: game.players
        })
    })
}

export async function activateSignup(options: { id: string, name: string }) {
    const game = await getGameByName(options.name);

    if(game == null) throw new Error("Game not found.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    const signup = game.message;

    await ref.update({
        message: {
            id: options.id,
        }
    })

    refreshSignup(options.name);

    if(signup) {
        const setup = await getSetup();

        if(typeof setup == 'string') throw new Error("Setup incomplete.");

        let message = await setup.primary.chat.messages.fetch(signup.id).catch(() => { return undefined; });

        if(!message || !message.editable) return;

        const embed = new EmbedBuilder()
            .setTitle("Sign ups for " + game.name + "!")
            .setColor(Colors.Red)
            .setDescription("This sign up message has been deactivated.")
            
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "reactivate", game: game.name }))
                    .setLabel("Reactivate")
                    .setStyle(ButtonStyle.Danger)
            ])

        await message.edit({
            embeds: [embed],
            components: [row]
        });
    }
}

export async function refreshSignup(name: string) {
    const game = await getGameByName(name);
    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");
    if(game == null) throw new Error("Game not found.");
    if(game.message == null) return;

    let message = await setup.primary.chat.messages.fetch(game.message?.id ?? "not-a-message");

    if(!message || !message.editable) return;

    let list = "";

    for(let i = 0; i < game.signups.length; i++) {
        const user = await getUser(game.signups[i]);

        if(user) {
            list += user.nickname + "\n";
        } else {
            list += "<@" + game.signups[i] + ">" + "\n";
        }
    }

    const embed = new EmbedBuilder()
        .setTitle("Sign ups for " + game.name + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription(game.signups.length == 0 ? "No sign ups." : list );

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

    await message.suppressEmbeds(false); // in case embeds were suppressed

    await message.edit({
        embeds: [embed],
        components: [row]
    });
}