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

// Drops queued joins left over from games that aren't running (keeps every running game's). Replaces the old start-of-game wipe of the whole
// collection, which would also delete another running game's entries (and raced with the new game's own entries).
export async function pruneRoleQueue(instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    // Imported lazily: context imports modules that import this one.
    const { getRunningGames } = await import("./context");

    const running = (await getRunningGames(instance)).map(game => game.game.id);

    const docs = (await db.collection('instances').doc(instance.id).collection('roles').get()).docs;

    await Promise.all(docs.filter(doc => doc.data().game == null || !running.includes(doc.data().game)).map(doc => doc.ref.delete()));
}