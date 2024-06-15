import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ChatInputCommandInteraction, Colors, EmbedBuilder, TextChannel } from "discord.js";
import { firebaseAdmin } from "../firebase";
import { getSetup } from "./setup";
import { getGameByName, getGameID, getGlobal } from "./main";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { User, getUser } from "./user";
import { register } from "../register";

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
}

export async function addSignup(options: { id: string, game: string }) {
    const db = firebaseAdmin.getFirestore();

    const game = await getGameByName(options.game);

    if(game == null) return false;

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

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
    const global = await getGlobal();

    if(global.started) throw new Error("Game has already started, sign ups are closed.");
    if(game == null) throw new Error("Game not found." )

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games').doc(game.id);

    await ref.update({
        closed: false,
    })
}

export async function closeSignups(name: string) {
    const game = await getGameByName(name);
    const global = await getGlobal();

    if(global.started) throw new Error("Game has already started, sign ups are closed.");
    if(game == null) throw new Error("Game not found.")

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
        .setDescription((game.signups.length == 0 ? "No sign ups." : list ) + "\nSign up by using the **/signup** command!");

    await message.suppressEmbeds(false); // in case embeds were suppressed

    await message.edit({
        embeds: [embed],
        components: [],
    });
}


export async function archiveGame(interaction: ChatInputCommandInteraction, name: string) {
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

export async function createGame(interaction: ChatInputCommandInteraction) {
    const setup = await getSetup();

    if(typeof setup == 'string') throw new Error("Setup Incomplete");

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game').collection('games');

    const name = interaction.options.getString("game") ? interaction.options.getString("game") as string : "Untitled Game " + getRandom(1, 9) + getRandom(1, 9) + getRandom(1, 9);

    const exists = await getGameByName(name);

    if(exists) throw new Error("Duplicate game names not allowed.");

    const requirements = z.string().max(20, "Max length 20 characters.").regex(/^[a-zA-Z_]+( [a-zA-Z_]+)*$/, "Only letters and spaces allowed.");

    const check = requirements.safeParse(name);

    if(!check.success) {
        throw new Error("Name Error - " + check.error.flatten().formErrors.join(" "));
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

    await register();

    await interaction.editReply({ content: name + " game created." })
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