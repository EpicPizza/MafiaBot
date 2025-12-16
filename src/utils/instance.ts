import { Transaction } from "firebase-admin/firestore";
import { firebaseAdmin, phoneAdmin } from "./firebase";
import { Global } from "./global";
import { getSetup, Setup } from "./setup";

interface Instance {
    setup: Setup,
    global: Global,
    name: string,
    id: string,
}

const map: Map<string, { instance: Instance, timestamp: number }> = new Map();
let fetched = false;

export async function getInstance(id: string) {
    const db = process.env.PHONE == id ? phoneAdmin.getFirestore() : firebaseAdmin.getFirestore();
    const ref = db.collection("instances").doc(id);
    const name = (await ref.get()).data()?.name as string;

    const setup = await getSetup(id, process.env.PHONE == id ? phoneAdmin : firebaseAdmin);

    const globalRef = ref.collection('settings').doc('game');
    const globalDoc = await globalRef.get();
    const global = globalDoc.data() ? globalDoc.data() as Global : undefined;
    if(global == undefined) throw new Error("Database not setup.");

    const instance = { setup, global, name, id };

    map.set(id, { instance, timestamp: new Date().valueOf() });

    return instance;
}

export async function getCachedInstance(id: string) {
    const cached = map.get(id);

    if(cached && (new Date().valueOf() - cached.timestamp) < (1000 * 20)) {
        return cached.instance;
    } else {
        return await getInstance(id);
    }
} 

export async function getAuthority(id: string, useCache: boolean = true) {
    if(!fetched || !useCache) {
        await getInstances();
        fetched = true;
    }

    const cached = Array.from(map.values());
    
    for(let i = 0; i < cached.length; i++) {
        const setup = cached[i].instance.setup;

        if(![setup.primary.guild.id, setup.secondary.guild.id, setup.tertiary.guild.id].includes(id)) continue;

        return await getCachedInstance(cached[i].instance.id);
    };

    return undefined;
}

export async function getCachedInstances() {
    if(!fetched) {
        await getInstances();
        fetched = true;
    }

    const cached = Array.from(map.values());

    return cached.map(cachedInstance => cachedInstance.instance);
}

export async function getInstances() {
    const db = firebaseAdmin.getFirestore();

    const docs = await db.collection("instances").listDocuments();

    const instances = Promise.all(docs.map((doc) => getInstance(doc.id)));

    return instances;
}