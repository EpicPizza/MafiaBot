import { firebaseAdmin } from "../firebase";

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
}

export async function onjoin(queue: RoleQueue) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(process.env.INSTANCE ?? "---").collection('roles');

    await ref.add(queue);
}