import { firebaseAdmin } from "../firebase";
import type { Setup } from "../setup";

export interface User {
    id: string,
    nickname: string,
    emoji: string | false,
    settings: {
        auto_confirm: false,
    },
    channel: string | null;
}

export async function getUserByName(name: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users');

    const docs = (await ref.where('lName', '==', name.toLowerCase()).get()).docs;

    if(docs.length > 0) return docs[0].data() as User;

    return undefined;
}

export async function getUserByChannel(channel: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users');

    const docs = (await ref.where('channel', '==', channel).get()).docs;

    if(docs.length > 0) return docs[0].data() as User;

    return undefined;
}

export async function createUser(id: string, nickname: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users').doc(id);

    if((await ref.get()).exists) {
        await ref.update({
            nickname: nickname,
            lName: nickname.toLowerCase(),
            id: id,
            emoji: false,
            settings: {
                auto_confirm: false,
            },
        })
    } else {
        await ref.set({
            nickname: nickname,
            lName: nickname.toLowerCase(),
            id: id,
            emoji: false,
            settings: {
                auto_confirm: false,
            },
            channel: null,
        })
    }
}

export async function getUsersArray(list: string[]) {
    const promises = [] as Promise<User | undefined>[];

    for(let i = 0; i < list.length; i++) {
        promises.push(getUser(list[i]));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        throw new Error("User not found.");
    }

    const users = [] as User[];

    for(let i = 0; i < results.length; i++) {
        if(results[i].status == "fulfilled") {
            //@ts-ignore
            users.push(results[i].value);
        }
    }

    return users;
}

export async function getUsers(list: string[]) {
    const promises = [] as Promise<User | undefined>[];

    for(let i = 0; i < list.length; i++) {
        promises.push(getUser(list[i]));
    }

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        throw new Error("User not found.");
    }

    const users = new Map<string, User>();

    for(let i = 0; i < results.length; i++) {
        if(results[i].status == "fulfilled") {
            //@ts-ignore
            users.set(results[i].value.id, results[i].value);
        }
    }

    return users;
}

export async function editUser(id: string, options: { nickname?: string, emoji?: string }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users').doc(id);

    await ref.update({
        ...(options.nickname ? { nickname: options.nickname, lName: options.nickname.toLowerCase() } : {}),
        ...(options.emoji ? { emoji: options.emoji } : {})
    })
}

export async function updateUsers() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users');

    const docs = (await ref.get()).docs;

    const promises = new Array();

    for(let i = 0; i < docs.length; i++) {
        promises.push(docs[i].ref.update({
            lName: docs[i].data().nickname.toLowerCase(),
        }));
    }

    await Promise.allSettled(promises);
}

export async function getUser(id: string): Promise<User | undefined> {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users').doc(id);

    const doc = await ref.get();

    const data = doc.data();

    if(!doc.exists || doc.data()?.nickname == null) {
        return undefined;
    } else if(data) {
        return data as User;
    }
}

export async function getPlayerObjects(id: string, setup: Setup) {
    const deadPlayer = setup.secondary.guild.members.fetch(id).catch(() => undefined);
    const userProfile = getUser(id);
    const player = setup.primary.guild.members.fetch(id).catch(() => undefined);
    const mafiaPlayer = setup.tertiary.guild.members.fetch(id).catch(() => undefined);

    const results = await Promise.allSettled([ deadPlayer, userProfile, player, mafiaPlayer ]);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error("<@" + id + "> not found.");
    }

    //imma look back at this is say, nonononononononono why was i doing this way or typescript sucked
    return { 
        deadPlayer: await deadPlayer, 
        userProfile: await userProfile as User, 
        player: await player, 
        mafiaPlayer: await mafiaPlayer,
    };
}
export async function getAllUsers() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users');

    const docs = (await ref.get()).docs;

    const users = [] as User[];

    for (let j = 0; j < docs.length; j++) {
        if (docs[j].data().nickname != null) {
            users.push(docs[j].data() as User);
        }
    }

    return users;
}export async function getAllNicknames() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users');

    const docs = (await ref.get()).docs;

    const nicknames = [] as string[];

    for (let j = 0; j < docs.length; j++) {
        if (docs[j].data().nickname != null) {
            nicknames.push(docs[j].data().nickname);
        }
    }

    return nicknames;
}

