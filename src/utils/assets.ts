import { randomUUID } from "node:crypto";
import { Attachment, ChatInputCommandInteraction, Colors, EmbedBuilder, Message } from "discord.js";
import { firebaseAdmin } from "./firebase";
import { Instance } from "./instance";
import { isMod } from "./mod";

/**
 * Assets (rolecards, item images, videos, ...).
 *
 * Files live in Firebase Storage under instances/{instance}/assets/, with metadata in the
 * Firestore collection instances/{instance}/assets. Public assets can be displayed and
 * searched by anyone; private ones only by mods. Only mods can add, remove, or edit assets.
 */

export type AssetVisibility = 'public' | 'private';

export interface Asset {
    name: string,
    visibility: AssetVisibility,
    addedBy: string,
    filename: string,
    contentType: string,
    size: number,
    path: string,
    /** Permanent Firebase download link (token-based, so it never expires and isn't guessable). */
    url: string,
    createdAt: number,
}

/** Largest file accepted by ?asset add. */
const MAX_UPLOAD = 50 * 1024 * 1024;

export function assetsRef(instance: Instance) {
    return firebaseAdmin.getFirestore().collection('instances').doc(instance.id).collection('assets');
}

export function assetKey(name: string) {
    const key = name.trim().toLowerCase();

    if(key.length == 0) throw new Error("Asset name cannot be empty.");
    if(key.length > 64) throw new Error("Asset name must be 64 characters or less.");
    if(key.includes("/") || key == "." || key == "..") throw new Error("Asset name cannot contain '/'.");

    return key;
}

export async function isAssetMod(instance: Instance, user: string, guild: string | null | undefined) {
    return await isMod(instance.setup, instance.global, user, guild ?? "");
}

/** Throws unless the user is a mod. */
export async function requireAssetMod(instance: Instance, user: string, guild: string | null | undefined) {
    if(!(await isAssetMod(instance, user, guild))) throw new Error("You're not a mod!");
}

export function canSee(asset: Asset, mod: boolean) {
    return mod || asset.visibility == 'public';
}

export async function getAsset(instance: Instance, name: string) {
    const doc = await assetsRef(instance).doc(assetKey(name)).get();

    return doc.exists ? doc.data() as Asset : undefined;
}

/** Fetches an asset the user is allowed to see, throwing a user-facing error otherwise. */
export async function getVisibleAsset(instance: Instance, name: string, mod: boolean) {
    const asset = await getAsset(instance, name);

    if(asset == undefined || !canSee(asset, mod)) throw new Error(`Asset "${name}" not found.`);

    return asset;
}

export async function getVisibleAssets(instance: Instance, mod: boolean) {
    const query = mod ? assetsRef(instance) : assetsRef(instance).where('visibility', '==', 'public');

    const assets = (await query.get()).docs.map(doc => doc.data() as Asset);

    return assets.sort((a, b) => a.name.localeCompare(b.name));
}

export interface AssetSource {
    url: string,
    filename: string,
}

export function sourceFromAttachment(attachment: Attachment): AssetSource {
    return { url: attachment.url, filename: attachment.name };
}

export function sourceFromUrl(url: string): AssetSource {
    let parsed: URL;

    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Invalid URL.");
    }

    if(parsed.protocol != 'https:' && parsed.protocol != 'http:') throw new Error("URL must be http(s).");

    const filename = decodeURIComponent(parsed.pathname.split("/").pop() ?? "") || "asset";

    return { url: parsed.toString(), filename };
}

/** Finds an attachment on the command message itself, or on the message it replies to. */
export async function findMessageAttachment(message: Message) {
    const own = message.attachments.first();
    if(own) return own;

    if(message.reference?.messageId == undefined) return undefined;

    const referenced = await message.fetchReference().catch(() => undefined);

    return referenced?.attachments.first();
}

async function download(source: AssetSource) {
    const response = await fetch(source.url).catch(() => undefined);
    if(response == undefined || !response.ok) throw new Error("Couldn't download that file.");

    const tooLarge = `File is too large (max ${MAX_UPLOAD / 1024 / 1024}MB).`;

    if(Number(response.headers.get('content-length') ?? 0) > MAX_UPLOAD) throw new Error(tooLarge);

    const contentType = (response.headers.get('content-type') ?? 'application/octet-stream').split(";")[0].trim();
    if(!contentType.startsWith('image/') && !contentType.startsWith('video/')) throw new Error(`Only images and videos can be stored (got ${contentType}).`);

    const data = Buffer.from(await response.arrayBuffer());
    if(data.length > MAX_UPLOAD) throw new Error(tooLarge);

    return { data, contentType };
}

function sanitizeFilename(name: string) {
    return name.replace(/[^\w.\-]+/g, "_").slice(-100) || "asset";
}

export async function addAsset(instance: Instance, options: { name: string, addedBy: string, visibility: AssetVisibility, source: AssetSource }) {
    const ref = assetsRef(instance).doc(assetKey(options.name));

    if((await ref.get()).exists) throw new Error(`An asset named "${options.name.trim()}" already exists.`);

    const { data, contentType } = await download(options.source);

    const filename = sanitizeFilename(options.source.filename);
    const path = `instances/${instance.id}/assets/${Date.now()}-${filename}`;
    const file = firebaseAdmin.getBucket().file(path);
    const token = randomUUID();

    await file.save(data, { contentType, resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: token } } }).catch(e => {
        throw new Error("Firebase Storage upload failed (is Storage enabled and FIREBASE_STORAGE_BUCKET set?): " + (e?.message ?? e));
    });

    const asset: Asset = {
        name: options.name.trim(),
        visibility: options.visibility,
        addedBy: options.addedBy,
        filename,
        contentType,
        size: data.length,
        path,
        url: downloadUrl(file.bucket.name, path, token),
        createdAt: Date.now(),
    };

    const created = await firebaseAdmin.getFirestore().runTransaction(async t => {
        if((await t.get(ref)).exists) return false;

        t.create(ref, asset);

        return true;
    });

    if(!created) {
        await file.delete({ ignoreNotFound: true }).catch(() => {});

        throw new Error("That asset name was just taken.");
    }

    return asset;
}

export async function removeAsset(instance: Instance, name: string) {
    const asset = await getVisibleAsset(instance, name, true);

    await assetsRef(instance).doc(assetKey(asset.name)).delete();
    await firebaseAdmin.getBucket().file(asset.path).delete({ ignoreNotFound: true }).catch(() => {});

    return asset;
}

export async function renameAsset(instance: Instance, name: string, to: string) {
    const asset = await getVisibleAsset(instance, name, true);

    const fromRef = assetsRef(instance).doc(assetKey(asset.name));
    const toRef = assetsRef(instance).doc(assetKey(to));

    await firebaseAdmin.getFirestore().runTransaction(async t => {
        if(fromRef.id != toRef.id && (await t.get(toRef)).exists) throw new Error("That asset name is taken.");

        t.delete(fromRef);
        t.set(toRef, { ...asset, name: to.trim() });
    });

    return { ...asset, name: to.trim() };
}

export async function setAssetVisibility(instance: Instance, name: string, visibility: AssetVisibility) {
    const asset = await getVisibleAsset(instance, name, true);

    await assetsRef(instance).doc(assetKey(asset.name)).update({ visibility });

    return { ...asset, visibility };
}

function downloadUrl(bucket: string, path: string, token: string) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** The message that shows an asset: a link to its file in Firebase Storage, which Discord embeds. */
export function getAssetPayload(asset: Asset) {
    return { content: `[${asset.name}](${asset.url})` };
}

function formatSize(size: number) {
    return size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + "MB" : Math.ceil(size / 1024) + "KB";
}

/** One line per asset, for lists. The name links to the file. */
export function describeAsset(asset: Asset, mod: boolean) {
    return `[**${asset.name}**](${asset.url}) · ${asset.contentType} · ${formatSize(asset.size)}` + (mod ? ` · ${asset.visibility == 'private' ? '🔒 private' : 'public'} · <@${asset.addedBy}>` : "");
}

/** A full card for a single asset, with a preview when it's an image. */
export function assetEmbed(asset: Asset, title?: string) {
    const embed = new EmbedBuilder()
        .setTitle(title ?? asset.name)
        .setURL(asset.url)
        .setColor(asset.visibility == 'private' ? Colors.DarkGrey : Colors.Green)
        .addFields(
            { name: 'Name', value: asset.name, inline: true },
            { name: 'Visibility', value: asset.visibility == 'private' ? '🔒 private (mods)' : 'public', inline: true },
            { name: 'Added by', value: `<@${asset.addedBy}>`, inline: true },
            { name: 'Type', value: asset.contentType, inline: true },
            { name: 'Size', value: formatSize(asset.size), inline: true },
        )
        .setTimestamp(asset.createdAt);

    if(asset.contentType.startsWith('image/')) embed.setThumbnail(asset.url);

    return embed;
}

/** A list of assets, trimmed to fit in one embed. */
export function assetListEmbed(assets: Asset[], mod: boolean, query: string) {
    let body = "";
    let shown = 0;

    for(const asset of assets) {
        const line = describeAsset(asset, mod) + "\n";

        if(body.length + line.length > 3900) break;

        body += line;
        shown++;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${assets.length} asset${assets.length == 1 ? '' : 's'}` + (query ? ` matching "${query}"` : ''))
        .setColor(Colors.Blurple)
        .setDescription(body);

    if(shown < assets.length) embed.setFooter({ text: `...and ${assets.length - shown} more, narrow your search.` });

    return embed;
}

type AssetInteraction = { type: 'text', message: Message } | ChatInputCommandInteraction;

/** Replies to a text command, or edits the deferred reply of a slash command. Never pings. */
export async function respond(interaction: AssetInteraction, payload: { content?: string, embeds?: EmbedBuilder[] }) {
    const options = { ...payload, allowedMentions: { parse: [] } };

    if('message' in interaction && interaction.type == 'text') {
        return await interaction.message.reply(options);
    } else {
        return await (interaction as ChatInputCommandInteraction).editReply(options);
    }
}

export function commandGuild(interaction: AssetInteraction) {
    return 'message' in interaction && interaction.type == 'text' ? interaction.message.guildId : (interaction as ChatInputCommandInteraction).guildId;
}
