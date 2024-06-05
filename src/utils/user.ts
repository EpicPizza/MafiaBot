import { firebaseAdmin } from "../firebase";

export interface User {
    id: string,
    nickname: string,
    emoji: string | false,
    settings: {
        auto_confirm: false,
    },
    channel: string | null;
}

export async function createUser(id: string, nickname: string) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users').doc(id);

    await ref.set({
        nickname: nickname,
        id: id,
        emoji: false,
        settings: {
            auto_confirm: false,
        },
        channel: null,
    })
}

export async function editUser(id: string, options: { nickname?: string, emoji?: string }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('users').doc(id);

    await ref.update({
        ...(options.nickname ? { nickname: options.nickname } : {}),
        ...(options.emoji ? { emoji: options.emoji } : {})
    })
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