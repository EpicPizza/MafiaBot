import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";

// Live in-memory copy of each instance's games collection, kept current by a snapshot listener.
// Attaching costs one read per game doc; after that only changed docs are read, whoever writes them
// (this bot, the website, extensions). Replaces re-querying the collection on every command and message.

interface Entry {
    docs: Map<string, QueryDocumentSnapshot>,
    ready: Promise<void>,
    unsubscribe: () => void,
}

const entries = new Map<string, Entry>();

function attach(instanceId: string): Entry {
    const existing = entries.get(instanceId);
    if(existing) return existing;

    const ref = firebaseAdmin.getFirestore().collection('instances').doc(instanceId).collection('games');
    const docs = new Map<string, QueryDocumentSnapshot>();

    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const ready = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    ready.catch(() => {}); // handled by callers awaiting it

    const unsubscribe = ref.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if(change.type == 'removed') docs.delete(change.doc.id);
            else docs.set(change.doc.id, change.doc);
        });

        resolve();
    }, error => {
        console.log("Games cache listener failed, will reattach on next use.", error);

        if(entries.get(instanceId) === entry) entries.delete(instanceId);
        reject(error);
    });

    const entry: Entry = { docs, ready, unsubscribe };
    entries.set(instanceId, entry);

    return entry;
}

// Every game doc in the instance (any state).
export async function getGameDocs(instanceId: string): Promise<QueryDocumentSnapshot[]> {
    const entry = attach(instanceId);

    try {
        await entry.ready;
        return [...entry.docs.values()];
    } catch {
        // Listener down: read directly this time, the next call retries the listener.
        return (await firebaseAdmin.getFirestore().collection('instances').doc(instanceId).collection('games').get()).docs;
    }
}

export async function getActiveGameDocs(instanceId: string) {
    return (await getGameDocs(instanceId)).filter(doc => doc.data().state == 'active');
}

// One game doc, or undefined. Falls back to a direct read when missing, e.g. a game created a moment ago
// whose snapshot hasn't arrived yet.
export async function getGameDoc(instanceId: string, id: string) {
    const cached = (await getGameDocs(instanceId)).find(doc => doc.id == id);
    if(cached) return { id: cached.id, data: cached.data() };

    const doc = await firebaseAdmin.getFirestore().collection('instances').doc(instanceId).collection('games').doc(id).get();
    const data = doc.data();

    return data == undefined ? undefined : { id: doc.id, data };
}

export function detachGamesCache(instanceId?: string) {
    for(const [id, entry] of entries) {
        if(instanceId != undefined && id != instanceId) continue;

        entry.unsubscribe();
        entries.delete(id);
    }
}
