import { Transaction, FieldValue } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import client from "../discord";
import { ActionRow, ButtonStyle, ChatInputCommandInteraction, Colors, GuildBasedChannel, PermissionsBitField } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { getUser } from "./user";
import { getSetup } from "./setup";

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
    closed: boolean,
    players: Player[]
    day: number
}

interface Player {
    id: string,
    alignment: 'mafia' | 'neutral' | 'town' | null,
}

export async function startGame(interaction: ChatInputCommandInteraction) {
    const game = await getGame();
    const setup = await getSetup();

    if(setup == undefined) return await interaction.reply({ ephemeral: true, content: "Setup not complete." });
    if(typeof setup == 'string') return await interaction.reply({ ephemeral: true, content: "An unexpected error occurred." });
    if(game.started) return await interaction.reply({ ephemeral: true, content: "Game has already started." });

    await interaction.deferReply({ ephemeral: true });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: true,
        closed: true,
    });

    await setup.chat.send("<@&" + setup.gang + "> Game has started!");

    await setup.chat.permissionOverwrites.edit(setup.alive, {
        SendMessages: true,
        AddReactions: true, 
        AttachFiles: true, 
        EmbedLinks: true, 
        SendPolls: true, 
        SendVoiceMessages: true,
        UseExternalEmojis: true,
        SendTTSMessages: false,
    });

    await setup.chat.permissionOverwrites.edit(setup.gang, {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false,
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

    return await interaction.editReply({ content: "Game has started!" });
}

export async function endGame(interaction: ChatInputCommandInteraction) {
    const game = await getGame();
    const setup = await getSetup();

    if(setup == undefined) return await interaction.reply({ ephemeral: true, content: "Setup not complete." });
    if(typeof setup == 'string') return await interaction.reply({ ephemeral: true, content: "An unexpected error occurred." });
    if(!game.started) return await interaction.reply({ ephemeral: true, content: "Game has not started." });

    await interaction.deferReply({ ephemeral: true });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        started: false,
        closed: true,
    });

    await setup.chat.send("<@&" + setup.gang + "> Game has ended!");

    await setup.chat.permissionOverwrites.edit(setup.gm, {
        ManageChannels: true,
        ManageRoles: true,
        ManageWebhooks: true,
        ViewChannel: true,
        SendMessages: true,
        SendTTSMessages: true,
        ManageMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ReadMessageHistory: true,
        MentionEveryone: true,
        UseExternalEmojis: true,
        AddReactions: true,
        ManageThreads: true,
        CreatePublicThreads: true,
        CreatePrivateThreads: true,
        SendMessagesInThreads: true,
        UseApplicationCommands: true
    });

    await setup.chat.permissionOverwrites.edit(setup.alive, {});

    await setup.chat.permissionOverwrites.edit(setup.gang, {
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

    return await interaction.editReply({ content: "Game has ended!" });
}


export async function addPlayer(options: { id: string }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await db.runTransaction(async t => {
        const game = await getGame(t);

        const player = game.players.find((value) => { value.id == options.id });

        if(player == undefined) {
            t.update(ref, {
                players: FieldValue.arrayUnion({ id: options.id, alignment: null } satisfies Player)
            })
        }
    })
}

export async function removePlayer(options: { id: string }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await db.runTransaction(async t => {
        const game = await getGame(t);

        const players = game.players.filter((value) => value.id != options.id );

        t.update(ref, {
            players: players
        })
    })
}

export async function openSignups(interaction: ChatInputCommandInteraction) {
    const game = await getGame();

    if(game.started) return await interaction.reply({ ephemeral: true, content: "Game has already started, sign ups are closed." });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    await ref.update({
        closed: false,
    })
}

export async function closeSignups(interaction: ChatInputCommandInteraction) {
    const game = await getGame();

    if(game.started) return await interaction.reply({ ephemeral: true, content: "Game has already started, sign ups are closed." });

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

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

export async function activateSignup(options: { id: string, guild: string, channel: string }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    const signup = await getSignup();

    await ref.update({
        message: {
            id: options.id,
            guild: options.guild,
            channel: options.channel,
        }
    })

    refreshSignup();

    if(signup) {
        let guild = client.guilds.cache.get(signup.guild);
        if(!guild) guild = await client.guilds.fetch(signup.guild).catch(() => { return undefined; });

        if(!guild) return;

        let channel = guild.channels.cache.get(signup.channel) as GuildBasedChannel | null;
        if(!channel) channel = await guild.channels.fetch(signup.channel).catch(() => { return null; });
        
        if(!channel) return;

        let message = channel.isTextBased() ? await channel.messages.fetch(signup.id).catch(() => { return undefined; }) : undefined;

        if(!message || !message.editable) return;

        const embed = new EmbedBuilder()
            .setTitle("Sign ups for Mafia!")
            .setColor(Colors.Red)
            .setDescription("This sign up message has been deactivated.")
            
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "reactivate" }))
                    .setLabel("Reactivate")
                    .setStyle(ButtonStyle.Danger)
            ])

        await message.edit({
            embeds: [embed],
            components: [row]
        });
    }
}

export async function getSignup() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('game');

    const data = (await ref.get()).data();

    if(data) {
        return data.message as { id: string, guild: string, channel: string }
    } 
} 

export async function refreshSignup() {
    const game = await getGame();
    
    const signup = await getSignup();

    if(!signup) return;

    let guild = client.guilds.cache.get(signup.guild);
    if(!guild) guild = await client.guilds.fetch(signup.guild);

    if(!guild) return;

    let channel = guild.channels.cache.get(signup.channel) as GuildBasedChannel | null;
    if(!channel) channel = await guild.channels.fetch(signup.channel);
    
    if(!channel) return;

    let message = channel.isTextBased() ? await channel.messages.fetch(signup.id) : undefined;

    if(!message || !message.editable) return;

    let list = "";

    for(let i = 0; i < game.players.length; i++) {
        const user = await getUser(game.players[i].id);

        if(user) {
            list += user.nickname + "\n";
        } else {
            list += "<@" + game.players[i].id + ">" + "\n";
        }
    }

    const embed = new EmbedBuilder()
        .setTitle("Sign ups for Mafia" + (game.closed ? " are closed" : "") + "!")
        .setColor(game.closed ? Colors.DarkRed : Colors.Blue)
        .setDescription(game.players.length == 0 ? "No sign ups." : list );

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            [
                new ButtonBuilder()
                    .setCustomId(JSON.stringify({ name: "sign-up" }))
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