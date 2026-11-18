import { firebaseAdmin } from "../firebase";
import { Instance } from "../instance";

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

    await ref.add({ ...queue, game: queue.game ?? instance.global.game ?? null } satisfies RoleQueue);
}

// Drops queued joins left over from games that aren't running. Replaces the old start-of-game wipe of the whole
// collection, which would also delete another running game's entries (and raced with the new game's own entries).
export async function pruneRoleQueue(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const running = instance.global.game;

    const docs = (await db.collection('instances').doc(instance.id).collection('roles').get()).docs;

    await Promise.all(docs.filter(doc => doc.data().game == null || doc.data().game != running).map(doc => doc.ref.delete()));
}