import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder, TextChannel } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import type { TextCommand } from '../../discord';
import client from "../../discord/client";
import { register } from "../../register";
import { firebaseAdmin } from "../firebase";
import { getGlobal } from '../global';
import { getSetup } from "../setup";
import { getPlayerObjects, getUser } from "./user";

export interface Signups { 
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
    confirmations: string[],
}

export async function addSignup(options: { id: string, game: string }) {
    const db = firebaseAdmin.getFirestore();
    const setup = await getSetup();

    const game = await getGameByName(options.game);
    const gameSetup = await getGameSetup(game, setup);

    if(game == null) return false;

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    const confirmed = await db.runTransaction(async t => {
        const doc = await t.get(ref);

        const data = doc.data();

        if(data == undefined) return;

        const confirmed = (data.confirmations as string[]).includes(options.id);

        if(!(data.signups as string[]).includes(options.id)) {
            t.update(ref, {
                signups: FieldValue.arrayUnion(options.id)
            })
        }

        return confirmed;
    });
    
    const playerObjects = await getPlayerObjects(options.id, setup);

    if(playerObjects.player) {
        const member = playerObjects.player;

        if(member.roles.cache.get(setup.primary.gang.id) == undefined) {
            await member.roles.add(setup.primary.gang.id);
        }
    }

    if(confirmed === false) {
        const dm = await (await client.users.fetch(options.id)).createDM();

        if(!dm) return await gameSetup.spec.send("Unable to send dms to <@" + options.id + ">.");

        const db = firebaseAdmin.getFirestore();

        const domain = (process.env.DEV == 'TRUE' ? process.env.DEVDOMAIN : process.env.DOMAIN);
        let message = "";

        const query = db.collection('documents').where('integration', '==', 'Welcome');
        const docs = (await query.get()).docs;
        if(docs.length < 1) message = domain  + "/docs/welcome-message/";
        if(docs.length > 0) message = (docs[0].data().content as string).replaceAll("](/", "](" + domain + "/");

        const embed = new EmbedBuilder()
            .setTitle('Welcome!')
            .setDescription(message)
            .setColor(Colors.Yellow)

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "confirm-signup", game: game.name }))
                    .setStyle(ButtonStyle.Primary)
                    .setLabel('Confirm')
            )

        await dm.send({ components: [row], embeds: [embed] });
    }

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
    const global = await getGlobal();

    if(game == null) throw new Error("Game not found." );
    if(global.started && global.game == game.id) throw new Error("Game has already started, sign ups are closed.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.update({
        closed: false,
    })
}

export async function closeSignups(name: string) {
    const game = await getGameByName(name);
    const global = await getGlobal();

    if(game == null) throw new Error("Game not found.")
    if(global.started && game.id == global.game) throw new Error("Game has already started, sign ups are closed.");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.update({
        closed: true,
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
        .setDescription((game.signups.length == 0 ? "No sign ups.\n" : list ) + "\nSign up by using the **/signup** command!");

    await message.suppressEmbeds(false); // in case embeds were suppressed

    await message.edit({
        embeds: [embed],
        components: [],
    });
}


export async function archiveGame(interaction: ChatInputCommandInteraction | TextCommand, name: string) {
    const setup = await getSetup();
    const game = await getGameByName(name);
    const global = await getGlobal();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");
    if(game == null || global == null) throw new Error("Game not found.");
    if(global.game == game.id && global.started) throw new Error("Game in progress.");

    const spec = await setup.secondary.guild.channels.fetch(game.channels.spec).catch(() => undefined);
    if(spec != undefined && spec.type == ChannelType.GuildText) await spec.setParent(setup.secondary.archive, { lockPermissions: true });

    const mafia = await setup.tertiary.guild.channels.fetch(game.channels.mafia).catch(() => undefined);
    if(mafia != undefined && mafia.type == ChannelType.GuildText) await mafia.setParent(setup.tertiary.archive, { lockPermissions: true });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.delete();

    await register();

    await interaction.reply({ ephemeral: true, content: "Game archived." });
}

export async function createGame(interaction: ChatInputCommandInteraction | TextCommand, name: string) {
    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games');

    const exists = await getGameByName(name).catch(() => { return undefined; });

    if(exists) throw new Error("Duplicate game names not allowed.");

    const requirements = z.string().min(1, "Minimum 1 character.").max(20, "Max length 20 characters.").regex(/^[a-zA-Z0-9 ]*$/, "Only letters, numbers, and spaces allowed.");

    const check = requirements.safeParse(name);

    if(!check.success) {
        throw new Error("Name Error - " + check.error.flatten().formErrors.join(" "));
    }

    if(interaction.type != 'text') await interaction.deferReply({ ephemeral: true });

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
        confirmations: [],
        channels: {
            spec: spec.id,
            mafia: mafia.id,
        }
    });

    await register();

    if(interaction.type != 'text') {
        await interaction.editReply({ content: name + " game created." })
    } else {
        await interaction.reply({ content: name + " game created." })
    }
}

export type GameSetup = Awaited<ReturnType<typeof getGameSetup>>

export async function getGameSetup(game: Signups, setup: Exclude<Awaited<ReturnType<typeof getSetup>>, string>) {
    const db = firebaseAdmin.getFirestore();

    const spec = await setup.secondary.guild.channels.fetch(game.channels.spec).catch(() => undefined);
    const mafia = await setup.tertiary.guild.channels.fetch(game.channels.mafia).catch(() => undefined);

    if(spec == undefined || mafia == undefined) throw new Error("Game Setup Incomplete");
    
    return { spec: spec as TextChannel, mafia: mafia as TextChannel };
}

function getRandom(min: number, max: number) {
    return Math.floor((Math.random() * (max - min) + min)).toString();
}

export async function getGames() {    
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games');

    const docs = (await ref.get()).docs;

    const games = [] as { name: string, id: string }[];

    for(let doc = 0; doc < docs.length; doc++) {
        const data = docs[doc].data();

        if(!data) continue;

        games.push({
            name: data.name,
            id: docs[doc].id,
        })
    };

    return games;
}

export async function getGameByName(name: string) {
    const db = firebaseAdmin.getFirestore();

    const docs = (await db.collection('settings').doc('game').collection('games').get()).docs;
    const games = docs.map(doc => doc.data());
    
    for(let i = 0; i < games.length; i++) {
        if(games[i].name.toLowerCase() == name.toLowerCase()) {
            return { ... games[i], id: docs[i].id } as Signups;
        }
    }

    throw new Error("Game not found in database.");
}

export async function getGameByID(id: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(id);

    const doc = (await ref.get());

    if(doc.data() == undefined) throw new Error("Game not found in database.");

    return { ... doc.data(), id: doc.id } as Signups;
}

export async function getGameID(name: string) {
    const game = await getGameByName(name);

    if(game == null) return null;

    return game.id;
}