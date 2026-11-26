import { firebaseAdmin } from "../firebase";
import { Instance } from "../instance";
import { getActiveGameDocs } from "./gameCache";

export interface RoleQueue {
    server: 'primary' | 'secondary' | 'tertiary',
    roles: {
        add?: string[],
        remove?: string[],
    }
    message?: {
        channel: string,
        content: string,
    },
    permissions?: {
        channel: string,
    },
    id: string,
    game?: string | null, // game the entry was queued for; missing on entries from before this was tracked
}

export async function onjoin(queue: RoleQueue, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('roles');

    await ref.add({ ...queue, game: queue.game ?? null } satisfies RoleQueue);
}

// Drops queued joins that no longer apply: untagged ones from before tagging, game-less ones (mod/spectator invites,
// cleared at each start as before), and ones for ended games. Keeps entries for every game that hasn't ended, running
// or not yet started (e.g. upick pregame invites). Replaces the old start-of-game wipe of the whole
// collection, which would also delete another running game's entries (and raced with the new game's own entries).
export async function pruneRoleQueue(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const active = new Set((await getActiveGameDocs(instance.id)).map(doc => doc.id));

    const docs = (await db.collection('instances').doc(instance.id).collection('roles').get()).docs;

    await Promise.all(docs.filter(doc => doc.data().game == null || !active.has(doc.data().game)).map(doc => doc.ref.delete()));
}