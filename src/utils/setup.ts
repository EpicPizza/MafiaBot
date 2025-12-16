import { CategoryChannel, ChannelType, Guild, PermissionsBitField, Role, TextChannel } from "discord.js";
import { z } from "zod";
import client from "../discord/client";
import { firebaseAdmin } from "./firebase";

const PartialSetup = z.object({
    primary: z.object({
        guild: z.string().nullable(),
        gang: z.string().nullable(),
        alive: z.string().nullable(),
        mod: z.string().nullable(),
        chat: z.string().nullable(),
    }),
    secondary: z.object({
        guild: z.string().nullable(),
        mod: z.string().nullable(),
        spec: z.string().nullable(),
        dms: z.string().nullable(),
        archivedDms: z.string().nullable(),
        ongoing: z.string().nullable(),
        archive: z.string().nullable(),
        access: z.string().nullable(),
        logs: z.string().nullable(),
    }),
    tertiary: z.object({
        guild: z.string().nullable(),
        mod: z.string().nullable(),
        spec: z.string().nullable(),
        access: z.string().nullable(),
        ongoing: z.string().nullable(),
        archive: z.string().nullable(),
    })
})

export async function getPartialSetup(instance: string | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance ? instance : process.env.INSTANCE ?? "---").collection('settings').doc('setup');

    const data = (await ref.get()).data();

    const setup = PartialSetup.safeParse(data);

    if(!data || !setup.success) throw new Error("Database not setup.");

    return setup.data;
}

export type Setup = Exclude<Awaited<ReturnType<typeof getSetup>>, string>;

export async function getSetup(instance: string | undefined = undefined, admin: typeof firebaseAdmin | undefined = undefined) {
    const setup = await checkSetup(instance, admin);

    if(typeof setup == 'string') {
        throw new Error("Setup Incomplete");
    } else {
        return setup;
    }
}

export async function checkSetup(instance: string | undefined = undefined, admin: typeof firebaseAdmin | undefined = undefined) {
    const db = admin ? admin.getFirestore() : firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance ? instance : process.env.INSTANCE ?? "---").collection('settings').doc('setup')

    const data = (await ref.get()).data();

    const parse = PartialSetup.safeParse(data);
    
    if(!data || !parse.success) throw new Error("Database not setup.");

    const setup = parse.data;

    const primary = fetchGuild(setup.primary.guild, [ PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageRoles ], "Primary server");
    const secondary = fetchGuild(setup.secondary.guild, [ PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.CreateInstantInvite, PermissionsBitField.Flags.AddReactions, PermissionsBitField.Flags.Administrator ], "Secondary server");
    const tertiary = fetchGuild(setup.tertiary.guild, [ PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.CreateInstantInvite, PermissionsBitField.Flags.AddReactions, PermissionsBitField.Flags.Administrator ], "Tertiary server");

    const alive = fetchRole(setup.primary.alive, setup.primary.guild, "Primary alive role");
    const primaryMod = fetchRole(setup.primary.mod, setup.primary.guild, "Primary mod role");
    const gang = fetchRole(setup.primary.gang, setup.primary.guild, "Primary gang role");
    const chat = fetchChannel(setup.primary.chat, setup.primary.guild, "Primary chat channel");
    
    const secondaryMod = fetchRole(setup.secondary.mod, setup.secondary.guild, "Secondary mod role"); 
    const secondarySpec = fetchRole(setup.secondary.spec, setup.secondary.guild, "Secondary spec role");
    const dms = fetchCategory(setup.secondary.dms, setup.secondary.guild, "Secondary dms category");
    const archivedDms = fetchCategory(setup.secondary.archivedDms, setup.secondary.guild, "Secondary archived dms category");
    const seocndaryOngoing = fetchCategory(setup.secondary.ongoing, setup.secondary.guild, "Secondary ongoing category");
    const secondaryArchive = fetchCategory(setup.secondary.archive, setup.secondary.guild, "Secondary archive category");
    const secondaryAccess = fetchRole(setup.secondary.access, setup.secondary.guild, "Secondary access role");
    const logs = fetchChannel(setup.secondary.logs, setup.secondary.guild, "Secondary logs channel");

    const tertiaryMod = fetchRole(setup.tertiary.mod, setup.tertiary.guild, "Tertiary mod role"); 
    const tertiarySpec = fetchRole(setup.tertiary.spec, setup.tertiary.guild, "Tertiary spec role");
    const tertiaryOngoing = fetchCategory(setup.tertiary.ongoing, setup.tertiary.guild, "Tertiary ongoing category");
    const tertiaryArchive = fetchCategory(setup.tertiary.archive, setup.tertiary.guild, "Tertiary archive category");
    const tertiaryAccess = fetchRole(setup.tertiary.access, setup.tertiary.guild, "Tertiary access role");

    const results = await Promise.allSettled([ primary, secondary, tertiary, alive, primaryMod, gang, chat, secondaryMod, secondarySpec, dms, archivedDms, seocndaryOngoing, secondaryArchive, tertiaryMod, tertiarySpec, tertiaryOngoing, tertiaryArchive, tertiaryAccess, secondaryAccess, logs ]);
    
    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        return fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", "");
    }

    return {
        primary: {
            guild: await primary,
            alive: await alive,
            mod: await primaryMod,
            gang: await gang,
            chat: await chat,
        },
        secondary: {
            guild: await secondary,
            mod: await secondaryMod,
            spec: await secondarySpec,
            dms: await dms,
            archivedDms: await archivedDms,
            ongoing: await seocndaryOngoing,
            archive: await secondaryArchive,
            access: await secondaryAccess,
            logs: await logs,
        },
        tertiary: {
            guild: await tertiary,
            mod: await tertiaryMod,
            spec: await tertiarySpec,
            ongoing: await tertiaryOngoing,
            archive: await tertiaryArchive,
            access: await tertiaryAccess,
        }
    }
}

export async function fetchGuild(id: string | null, checkFor: bigint[], name: string) {
    return new Promise<Guild>(async (resolve, reject) => {
        if(id == null) return reject(name + " not specified");

        const guild = await client.guilds.fetch(id).catch(() => { return undefined; }); //thanks discord.js

        if(guild == undefined) return reject(name + " not found");

        if(!(await guild.members.fetch(clientId())).permissions.has(checkFor)) return reject("Insufficient permissions in " + name);

        return resolve(guild);
    })
}

export function fetchChannel(id: string | null, guildId: string | null, name: string) {
    return new Promise<TextChannel>(async (resolve, reject) => {
        if(id == null || guildId == null) return reject(name + " not specified");

        const guild = await client.guilds.fetch(guildId).catch(() => { return undefined; });

        if(guild == undefined) return reject(name + " not found");

        const channel = await guild.channels.fetch(id).catch(() => { return undefined; });

        if(channel == null || channel.type != ChannelType.GuildText) return reject(name + " not found");

        return resolve(channel);
    })
}

export async function fetchCategory(id: string | null, guildId: string | null, name: string) {
    return new Promise<CategoryChannel>(async (resolve, reject) => {
        if(id == null || guildId == null) return reject(name + " not specified");

        const guild = await client.guilds.fetch(guildId).catch(() => { return undefined; });

        if(guild == undefined) return reject(name + " not found");

        const channel = await guild.channels.fetch(id).catch(() => { return undefined; });

        if(channel == null || channel.type != ChannelType.GuildCategory) return reject(name + " not found");

        return resolve(channel);
    })
}

export async function fetchRole(id: string | null, guildId: string | null, name: string) {
    return new Promise<Role>(async (resolve, reject) => {
        if(id == null || guildId == null) return reject(name + " not specified");

        const guild = await client.guilds.fetch(guildId).catch(() => { return undefined; });

        if(guild == undefined) return reject(name + " not found");

        const role = await guild.roles.fetch(id).catch(() => { return undefined; });

        if(role == null) return reject(name + " not found");

        return resolve(role);
    })
}

function clientId() {
    return (process.env.DEV == "TRUE" ? process.env.DEVCLIENT : process.env.CLIENT) as string;
}