import { Transaction, FieldValue, Firestore, CollectionReference, Query, DocumentReference } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import client from "../discord";
import Discord, { ActionRow, ActionRowComponent, BaseGuildTextChannel, ButtonStyle, ChannelType, ChatInputCommandInteraction, Collection, Colors, CommandInteraction, ComponentEmojiResolvable, FetchMembersOptions, GuildBasedChannel, GuildMember, PermissionsBitField, TextChannel } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { User, getUser } from "./user";
import { Setup, getSetup } from "./setup";
import { promise, z } from "zod";
import { refreshCommands } from "./vote";
import { GameSetup, Signups, getGameSetup, refreshSignup } from "./games";

const pings = false;

export async function getGlobal(t: Transaction | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    const doc = t ? await t.get(ref) : await ref.get();

    const data = doc.data();

    if(data) {
        return data as Global;
    }

    throw new Error("Could not find game on database.");
}

interface Global {
    started: boolean,
    locked: boolean,
    players: Player[]
    day: number,
    game: string | null,
    bulletin: string | null, 
}

interface Player {
    id: string,
    alignment: 'mafia' | 'neutral' | 'town' | null;
}

export function generateOverwrites(id: string) {
    return [
        {
            id: id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
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
        ViewChannel: true,
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

export async function unlockGame(increment: boolean = false) {
    const global = await getGlobal();
    const setup = await getSetup();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) return await setup.primary.chat.send("Failed to unlock channel, game has not started.");
    if(!global.locked) throw new Error("Already unlocked.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: false,
        day: increment ? global.day + 1 : global.day,
    });

    await db.collection('day').doc((increment ? global.day + 1 : global.day).toString()).set({
        game: global.game,
    })

    if(pings) {
        await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game has unlocked!");
    } else {
        await setup.primary.chat.send("Game has unlocked!");
    }

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
    const global = await getGlobal();
    const setup = await getSetup();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) return await setup.primary.chat.send("Failed to unlock channel, game has not started.");
    if(global.locked) throw new Error("Already locked.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: true,
    });

    await setup.primary.chat.send("Game has locked!");

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

export async function checkSignups(signups: string[], setup: Setup) { //probably could be optimized in a better way but who cares :)
    const promises = [] as Promise<any>[];

    for(let i = 0; i < signups.length; i++) { //chances someone is not the server is not zero (cough cough someone cough), check here to prevent game from starting if there is someone missing
        const id = signups[i];
        
        promises.push((async () => {
            const player = await setup.primary.guild.members.fetch(id).catch(() => undefined);
            if(player == null) throw new Error("Member not found. <@" + id + ">");
        })())
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function deleteInvites(setup: Setup) {
    const invites = Array.from(await setup.tertiary.guild.invites.fetch());

    const promises = [] as Promise<any>[];

    for(let i = 0; i < invites.length; i++) {
        if(invites[i][1].deletable) {
            promises.push(invites[i][1].delete());
        }
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function prepareGame(game: Signups) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: true,
        locked: true,
        game: game.id,
        players: game.signups.map((signup) => { return { id: signup, allignment: null } }),
        day: 0,
    });
}

export async function finishSignups(game: Signups) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.update({
        closed: true,
    })

    await refreshSignup(game.name);
}

export async function setupPermissions(setup: Setup, lock: boolean) {
    const promises = [] as Promise<any>[];

    if(!lock) {
        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.alive.id, {
            SendMessages: true,
            AddReactions: true, 
            AttachFiles: true, 
            EmbedLinks: true, 
            SendPolls: true, 
            SendVoiceMessages: true,
            UseExternalEmojis: true,
            SendTTSMessages: false,
            UseApplicationCommands: true,
        }));

        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
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
        }));
    } else {
        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.alive, {}));

        promises.push(setup.primary.chat.permissionOverwrites.create(setup.primary.gang, {
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
        }));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function setupDeadPlayer(id: string, setup: Setup) {
    const dead = await setup.secondary.guild.members.fetch(id).catch(() => undefined);
    if(dead != null) {
        await dead.roles.remove(setup.secondary.spec);
        await dead.roles.remove(setup.secondary.access);
    }
}

export async function setupAliveRole(player: Discord.GuildMember, setup: Setup) {
    await player.roles.add(setup.primary.alive);
}

export async function getPlayerObjects(id: string, setup: Setup) {
    const deadPlayer = setup.secondary.guild.members.fetch(id);
    const userProfile = getUser(id);
    const player = setup.primary.guild.members.fetch(id);
    const mafiaPlayer = setup.tertiary.guild.members.fetch(id).catch(() => undefined);

    const results = await Promise.allSettled([ deadPlayer, userProfile, player, mafiaPlayer ]);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error("<@" + id + "> not found.");
    }

    //imma look back at this is say, nonononononononono why was i doing this way or typescript sucked
    return { 
        deadPlayer: await deadPlayer as Discord.GuildMember, 
        userProfile: await userProfile as User, 
        player: await player as Discord.GuildMember, 
        mafiaPlayer: await mafiaPlayer,
    };
}

export async function setupMafiaPlayer(mafiaPlayer: GuildMember | undefined, setup: Setup, gameSetup: GameSetup) {
    if(mafiaPlayer?.joinedTimestamp) {
        await mafiaPlayer.roles.remove(setup.tertiary.spec);
        await mafiaPlayer.roles.remove(setup.tertiary.access);

        if(mafiaPlayer.kickable) {
            await mafiaPlayer.kick();
        } else {
            await gameSetup.mafia.send("Failed to kick <@" + mafiaPlayer.id + ">.");
        }
    }
}

export async function setupPlayer(id: string, setup: Setup, gameSetup: GameSetup) {
    const db = firebaseAdmin.getFirestore();

    const { deadPlayer, userProfile, player, mafiaPlayer } = await getPlayerObjects(id, setup);

    await setupAliveRole(player, setup);
    await setupDeadPlayer(id, setup)
    await setupMafiaPlayer(mafiaPlayer, setup, gameSetup);

    let channel = await setup.secondary.guild.channels.fetch(userProfile.channel ?? "");
    let newPlayer = channel == null;

    if(channel == null || channel.type != ChannelType.GuildText) {
        channel = await setup.secondary.guild.channels.create({ 
            parent: setup.secondary.dms, 
            name: userProfile.nickname.toLowerCase()
        });

        await db.collection('users').doc(userProfile.id).update({
            channel: channel.id,
        });
    }

    if(channel.parentId != setup.secondary.dms.id) {
        await channel.setParent(setup.secondary.dms.id);
    }

    await channel.permissionOverwrites.create(userProfile.id, editOverwrites());

    if(!deadPlayer) {
        const invite = await setup.secondary.guild.invites.create(channel, { unique: true });

        await db.collection('invites').add({
            id: userProfile.id,
            type: 'joining',
            timestamp: new Date().valueOf(),
        });

        const dm = await client.users.cache.get(id)?.createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to " + userProfile.nickname + ".");

        if(pings) {
            dm.send("Join the Dead Chat server to play in mafia! Here's a server invite: \nhttps://discord.com/invite/" + invite.code);
        }
    } else if(newPlayer) {
        channel.send("Welcome <@" + userProfile.id + ">! Check out the pins in the main mafia channel if you're still unsure how to play. You can also ask questions here to the game mod.");
    }
}

export async function getAllNicknames(setup: Setup, game: Signups) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users');

    const docs = (await ref.get()).docs;
    
    const nicknames = [] as string[];

    for(let i = 0; i < game.signups.length; i++) {
        for(let j = 0; j < docs.length; j++) {
            if(game.signups[i] == docs[j].id) {
                nicknames.push(docs[j].data().nickname);
            }
        }
    }

    return nicknames;
}

export async function startGame(interaction: ChatInputCommandInteraction, name: string) {
    await interaction.deferReply({ ephemeral: true });

    const global = await getGlobal();
    const game = await getGameByName(name);
    const setup = await getSetup();
    const db = firebaseAdmin.getFirestore();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(global.started) throw new Error("Game has already started.");
    if(game == null) throw new Error("Game not found.");
    if(game.signups.length == 0) throw new Error("Game must have more than one player.");

    const gameSetup = await getGameSetup(game, setup);

    await checkSignups(game.signups, setup);

    //at this point, things have been checked and accounted for and we can do multiple things at once now!

    const promises = [] as Promise<any>[];

    promises.push(deleteCollection(db, db.collection("day"), 20));
    promises.push(deleteCollection(db, db.collection("edits"), 20));
    promises.push(deleteCollection(db, db.collection("invites"), 20));
    promises.push(deleteInvites(setup));
    promises.push(finishSignups(game));
    promises.push(prepareGame(game));
    promises.push(setupPermissions(setup, true));

    for(let i = 0; i < game.signups.length; i++) {
        promises.push(setupPlayer(game.signups[i], setup, gameSetup));
    }

    if(pings) {
        promises.push(setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game is starting!"));
    } else {
        promises.push(setup.primary.chat.send("Game is starting!"));
    }

    promises.push(refreshCommands(await getAllNicknames(setup, game)));

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        const embed = new EmbedBuilder()
            .setTitle("Game Start Failed")
            .setColor(Colors.Red)
            .setDescription(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""))

        return await interaction.editReply({ embeds: [embed] });
    }

    return await interaction.editReply({ content: "Game is starting!" });
}

export async function clearGame() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: false,
        locked: false,
        players: [],
        day: 0,
        game: null,
    });
}

export async function archiveChannels(setup: Setup) {
    const promises = [] as Promise<any>[];

    await setup.secondary.guild.channels.fetch();

    const channels: TextChannel[] = [];

    for(let i = 0; i < setup.secondary.dms.children.cache.size; i++) {
        if(setup.secondary.dms.children.cache.at(i)) {
            channels.push(setup.secondary.dms.children.cache.at(i) as TextChannel);
        }
    }

    for(let i = 0; i < channels.length; i++) {
        promises.push(channels[i].setParent(setup.secondary.archivedDms, { lockPermissions: true }));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function setMafiaSpectator(mafiaPlayer: GuildMember | undefined, id: string, setup: Setup, gameSetup: GameSetup, userProfile: User) {
    const db = firebaseAdmin.getFirestore();
    
    if(mafiaPlayer) {
        await mafiaPlayer.roles.add(setup.tertiary.spec);
        await mafiaPlayer.roles.remove(setup.tertiary.access);
    } else {
        const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia.id, { unique: true });

        await db.collection('invites').add({
            id: userProfile.id,
            type: 'spectate',
            timestamp: new Date().valueOf(),
        });
            
        const dm = await client.users.cache.get(id)?.createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to " + userProfile.nickname + ".");

        if(pings) {
            dm.send("Here's a server invite to spectate mafia chat: \nhttps://discord.com/invite/" + invite.code);
        }
    }
}

export async function clearPlayer(id: string, setup: Setup, gameSetup: GameSetup) {
    const promises = [] as Promise<any>[];

    const { deadPlayer, userProfile, player, mafiaPlayer } = await getPlayerObjects(id, setup);

    promises.push(player.roles.remove(setup.primary.alive));
    promises.push(deadPlayer.roles.add(setup.secondary.spec));
    promises.push(deadPlayer.roles.remove(setup.secondary.access));

    promises.push(setMafiaSpectator(mafiaPlayer, id, setup, gameSetup, userProfile));

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}

export async function endGame(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const global = await getGlobal();
    const game = await getGameByID(global.game ?? "bruh");
    const setup = await getSetup();
    
    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred." );
    if(!global.started) throw new Error("Game has not started." );
    if(game == null) throw new Error("Game not found.");

    const gameSetup = await getGameSetup(game, setup);

    await checkSignups(game.signups, setup);

    const promises = [] as Promise<any>[];

    promises.push(clearGame());

    if(pings) {
        promises.push(setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game has ended!"));
    } else {
        promises.push(setup.primary.chat.send("Game has ended!"));
    }
    
    promises.push(setupPermissions(setup, false));
    promises.push(archiveChannels(setup));

    for(let i = 0; i < game.signups.length; i++) {
        promises.push(clearPlayer(game.signups[i], setup, gameSetup));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        const embed = new EmbedBuilder()
            .setTitle("Game Start Failed")
            .setColor(Colors.Red)
            .setDescription(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""))

        return await interaction.editReply({ embeds: [embed] });
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

export async function editPlayer(options: { id: string, alignment: 'mafia' | 'neutral' | 'town' | null }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await db.runTransaction(async t => {
        const global = await getGlobal(t);

        const player = global.players.find((value) => { value.id == options.id });

        if(player) {
            player.alignment = options.alignment;
        }

        t.update(ref, {
            players: global.players
        })
    })
}

export async function setAllignments() {
    const embed = new EmbedBuilder()
        .setTitle("Set Allignments")
        .setColor(Colors.Orange)
        .setDescription('Click corresponding button to toggle player\'s allignment. Once confirm is clicked, an invite for the mafia server will be created.')
        .setFooter({ text: 'Red for Mafia, Gray for Town/Neutral/Whatever Applicable' })

    const rows = [] as ActionRowBuilder<ButtonBuilder>[]

    const global = await getGlobal();

    if(global.game == null) throw new Error("Game not found.");

    const game = await getGameByID(global.game);
    const setup = await getSetup();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) throw new Error("Game has not started.");
    if(game == null) throw new Error("Game not found.");
    if(game.signups.length == 0) throw new Error("Game must have more than one player.");

    const gameSetup = await getGameSetup(game, setup);
    
    for(let i = 0; i < game.signups.length; i = i + 5) {
        const users = [await getPlayer(game.signups.at(i) ?? "", global), await getPlayer(game.signups.at(i + 1) ?? "", global), await getPlayer(game.signups.at(i + 2) ?? "", global), await getPlayer(game.signups.at(i + 3) ?? "", global), await getPlayer(game.signups.at(i + 4) ?? "", global)];

        const row = new ActionRowBuilder<ButtonBuilder>();

        for(let j = 0; j < users.length; j++) {
            const user = users[j];

            if(user == undefined) continue;

            const button = new ButtonBuilder()
                .setLabel((await getUser(user.id))?.nickname ?? "<@" + user.id + ">")
                .setStyle((() => {
                    switch(user.alignment) {
                        case 'town':
                            return ButtonStyle.Success;
                        case 'neutral':
                            return ButtonStyle.Primary;
                        case 'mafia':
                            return ButtonStyle.Danger;
                        default:
                            return ButtonStyle.Secondary;
                    }
                })())
                .setCustomId(JSON.stringify({ name: 'change-alignment', id: user.id }));

            row.addComponents([
                button
            ])
        }

        rows.push(row);
    }

    rows.push(new ActionRowBuilder<ButtonBuilder>()
        .addComponents([
            new ButtonBuilder()
                .setLabel("----------------------------")
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(JSON.stringify({ name: 'placeholder'}))
                .setDisabled()
        ])
    )

    rows.push(new ActionRowBuilder<ButtonBuilder>()
        .addComponents([
            new ButtonBuilder()
                .setLabel("Confirm")
                .setStyle(ButtonStyle.Primary)
                .setCustomId(JSON.stringify({ name: 'confirm-alignments' }))
        ])
    )

    await gameSetup.spec.send({ embeds: [embed], components: rows.filter((v, i) => i < 5) });
    if(rows.length > 4) await gameSetup.spec.send({ components: rows.filter((v, i) => i > 4 && i < 10) });
    if(rows.length > 9) await gameSetup.spec.send({ components: rows.filter((v, i) => i > 9 && i < 15) });
    if(rows.length > 14) await gameSetup.spec.send({ components: rows.filter((v, i) => i > 14 && i < 20) });
}

async function getPlayer(id: string, game: Awaited<ReturnType<typeof getGlobal>>) {
    for(let i = 0; i < game.players.length; i++) {
        if(game.players[i].id == id) {
            return game.players[i];
        }
    }
}


async function deleteCollection(db: Firestore, collection: CollectionReference, batchSize: number) {
    const query = collection.orderBy('__name__').limit(batchSize);

    return await deleteQueryBatch(db, query, batchSize);
}

async function deleteQueryBatch(db: Firestore, query: Query, batchSize: number) {
    const docs = (await query.get()).docs;

    let toDelete = [] as DocumentReference[];

    for(let i = 0; i < docs.length; i++) {
        const doc = docs[i].ref;

        const collections = await doc.listCollections();

        for(let j = 0; j < collections.length; j++) {
            await deleteCollection(db, collections[j], batchSize);

            await tick();
        }

        toDelete.push(doc);

        if(toDelete.length >= batchSize) {
            await deleteDocs(db, toDelete);

            toDelete = [];
        }
    }

    await deleteDocs(db, toDelete);
}

async function deleteDocs(db: Firestore, docs: DocumentReference[]) {
    const batch = db.batch();

    docs.forEach((ref) => {
        batch.delete(ref);
    })

    await batch.commit();

    await tick();
}

function tick() {
    return new Promise((resolve) => {
        process.nextTick(() => {
            resolve(0);
        })
    })
}