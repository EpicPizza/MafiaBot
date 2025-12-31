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
}

export async function onjoin(queue: RoleQueue, instance: Instance) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('instances').doc(instance.id).collection('roles');

    await ref.add(queue);
}