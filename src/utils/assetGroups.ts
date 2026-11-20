import { FieldValue } from "firebase-admin/firestore";
import { Colors, EmbedBuilder } from "discord.js";
import { firebaseAdmin } from "./firebase";
import { Instance } from "./instance";
import { Asset, AssetVisibility, assetKey, assetsRef, canSee, describeAsset } from "./assets";

/**
 * Asset groups: a named, ordered list of assets (e.g. every card for one role).
 *
 * Stored in instances/{instance}/assetGroups/{lowercased name}. Groups have their own
 * visibility, and members are filtered by their own visibility too, so a public group
 * never shows a private asset to a player.
 */

export interface AssetGroup {
    name: string,
    visibility: AssetVisibility,
    /** Asset keys (lowercased names), in display order. */
    assets: string[],
    addedBy: string,
    createdAt: number,
}

export function groupsRef(instance: Instance) {
    return firebaseAdmin.getFirestore().collection('instances').doc(instance.id).collection('assetGroups');
}

/** Splits "a, b, c" into entries, dropping blanks. Entries may still hold several space-separated names. */
export function parseAssetList(list: string) {
    return list.split(",").map(name => name.trim()).filter(name => name.length > 0);
}

/**
 * Matches list entries to known keys. An entry that isn't a key itself is split on spaces
 * ("seal lockedin" -> seal, lockedin), preferring the longest names so names with spaces still work.
 * Returns the matched keys in order without duplicates, plus the entries that couldn't be matched.
 */
export function matchNames(entries: string[], known: Set<string>) {
    const keys: string[] = [];
    const missing: string[] = [];

    for(const entry of entries) {
        const key = entry.trim().toLowerCase(); // not assetKey: an entry may be several names, longer than one name may be

        if(known.has(key)) {
            keys.push(key);
            continue;
        }

        const words = key.split(/\s+/);

        // split[i] = keys covering words[i..], or null if those words can't be covered.
        const split: (string[] | null)[] = new Array(words.length + 1).fill(null);
        split[words.length] = [];

        for(let i = words.length - 1; i >= 0; i--) {
            for(let j = words.length; j > i; j--) {
                const candidate = words.slice(i, j).join(" ");

                if(known.has(candidate) && split[j] != null) {
                    split[i] = [ candidate, ...split[j]! ];
                    break;
                }
            }
        }

        if(split[0] != null && split[0].length > 0) {
            keys.push(...split[0]);
        } else {
            // Point at the words that aren't names by themselves; if every word is, the entry as a whole didn't fit.
            const unknown = entry.trim().split(/\s+/).filter(word => !known.has(word.toLowerCase()));

            missing.push(...(unknown.length > 0 ? unknown : [ entry.trim() ]));
        }
    }

    return { keys: [ ...new Set(keys) ], missing };
}

/** Resolves list entries to asset keys (mods only, so private assets count), failing if any are missing. */
async function resolveAssets(instance: Instance, entries: string[]) {
    if(entries.length == 0) throw new Error("List at least one asset, separated by commas.");

    const known = new Set((await assetsRef(instance).select().get()).docs.map(doc => doc.id));
    const { keys, missing } = matchNames(entries, known);

    if(missing.length > 0) throw new Error("Assets not found: " + missing.join(", ") + ". Separate asset names with commas.");

    return keys;
}

export async function getGroup(instance: Instance, name: string) {
    const doc = await groupsRef(instance).doc(assetKey(name)).get();

    return doc.exists ? doc.data() as AssetGroup : undefined;
}

export async function getVisibleGroup(instance: Instance, name: string, mod: boolean) {
    const group = await getGroup(instance, name);

    if(group == undefined || !(mod || group.visibility == 'public')) throw new Error(`Group "${name}" not found.`);

    return group;
}

export async function getVisibleGroups(instance: Instance, mod: boolean) {
    const query = mod ? groupsRef(instance) : groupsRef(instance).where('visibility', '==', 'public');

    const groups = (await query.get()).docs.map(doc => doc.data() as AssetGroup);

    return groups.sort((a, b) => a.name.localeCompare(b.name));
}

/** The group's assets the viewer may see, in order. Members deleted since are skipped. */
export async function getGroupAssets(instance: Instance, group: AssetGroup, mod: boolean) {
    if(group.assets.length == 0) return [];

    const docs = await firebaseAdmin.getFirestore().getAll(...group.assets.map(key => assetsRef(instance).doc(key)));

    return docs
        .map(doc => doc.data() as Asset | undefined)
        .filter((asset): asset is Asset => asset != undefined && canSee(asset, mod));
}

export async function createGroup(instance: Instance, options: { name: string, assets: string[], visibility: AssetVisibility, addedBy: string }) {
    const ref = groupsRef(instance).doc(assetKey(options.name));
    const keys = await resolveAssets(instance, options.assets);

    const group: AssetGroup = {
        name: options.name.trim(),
        visibility: options.visibility,
        assets: keys,
        addedBy: options.addedBy,
        createdAt: Date.now(),
    };

    await firebaseAdmin.getFirestore().runTransaction(async t => {
        if((await t.get(ref)).exists) throw new Error(`A group named "${group.name}" already exists.`);

        t.create(ref, group);
    });

    return group;
}

export async function addToGroup(instance: Instance, name: string, names: string[]) {
    const ref = groupsRef(instance).doc(assetKey(name));
    const added = await resolveAssets(instance, names);

    return await firebaseAdmin.getFirestore().runTransaction(async t => {
        const group = (await t.get(ref)).data() as AssetGroup | undefined;
        if(group == undefined) throw new Error(`Group "${name}" not found.`);

        const keys = [ ...group.assets ];
        added.forEach(key => { if(!keys.includes(key)) keys.push(key) });

        t.update(ref, { assets: keys });

        return { ...group, assets: keys };
    });
}

export async function removeFromGroup(instance: Instance, name: string, names: string[]) {
    const ref = groupsRef(instance).doc(assetKey(name));

    if(names.length == 0) throw new Error("List at least one asset, separated by commas.");

    return await firebaseAdmin.getFirestore().runTransaction(async t => {
        const group = (await t.get(ref)).data() as AssetGroup | undefined;
        if(group == undefined) throw new Error(`Group "${name}" not found.`);

        const { keys: remove, missing } = matchNames(names, new Set(group.assets));
        if(missing.length > 0) throw new Error("Not in this group: " + missing.join(", ") + ". Separate asset names with commas.");

        const keys = group.assets.filter(key => !remove.includes(key));

        t.update(ref, { assets: keys });

        return { ...group, assets: keys };
    });
}

export async function deleteGroup(instance: Instance, name: string) {
    const group = await getVisibleGroup(instance, name, true);

    await groupsRef(instance).doc(assetKey(group.name)).delete();

    return group;
}

export async function setGroupVisibility(instance: Instance, name: string, visibility: AssetVisibility) {
    const group = await getVisibleGroup(instance, name, true);

    await groupsRef(instance).doc(assetKey(group.name)).update({ visibility });

    return { ...group, visibility };
}

/** Called when an asset is deleted: drops it from every group. */
export async function removeAssetFromGroups(instance: Instance, key: string) {
    const groups = await groupsRef(instance).where('assets', 'array-contains', key).get();

    const batch = firebaseAdmin.getFirestore().batch();
    groups.docs.forEach(doc => batch.update(doc.ref, { assets: FieldValue.arrayRemove(key) }));
    await batch.commit();
}

/** Called when an asset is renamed: swaps its key in every group, keeping its position. */
export async function renameAssetInGroups(instance: Instance, from: string, to: string) {
    if(from == to) return;

    const groups = await groupsRef(instance).where('assets', 'array-contains', from).get();

    const batch = firebaseAdmin.getFirestore().batch();
    groups.docs.forEach(doc => {
        const keys = (doc.data() as AssetGroup).assets.map(key => key == from ? to : key);

        batch.update(doc.ref, { assets: keys.filter((key, i) => keys.indexOf(key) == i) });
    });
    await batch.commit();
}

/** A summary card for a group, listing the members the viewer may see. */
export function groupEmbed(group: AssetGroup, assets: Asset[], mod: boolean, title?: string) {
    let body = "";
    let shown = 0;

    for(const asset of assets) {
        const line = `${shown + 1}. ` + describeAsset(asset, mod) + "\n";

        if(body.length + line.length > 3900) break;

        body += line;
        shown++;
    }

    const embed = new EmbedBuilder()
        .setTitle(title ?? group.name)
        .setColor(group.visibility == 'private' ? Colors.DarkGrey : Colors.Green)
        .setDescription(body || "*No assets.*");

    if(mod) {
        embed.addFields(
            { name: 'Name', value: group.name, inline: true },
            { name: 'Visibility', value: group.visibility == 'private' ? '🔒 private (mods)' : 'public', inline: true },
            { name: 'Added by', value: `<@${group.addedBy}>`, inline: true },
        );
    }

    if(shown < assets.length) embed.setFooter({ text: `...and ${assets.length - shown} more.` });

    return embed;
}
