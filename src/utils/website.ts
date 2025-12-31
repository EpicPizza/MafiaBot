import { runCommand } from "../api/spoof";
import { firebaseAdmin } from "./firebase";

let unsubscribe: undefined | (() => void) = undefined;

interface Call {
    command: string,
    instance: string,
    timestamp: number,
    received: boolean,
}

export async function websiteListener() {
    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('queue').orderBy('timestamp', 'desc').limit(1);

    if(unsubscribe) unsubscribe();

    unsubscribe = ref.onSnapshot(async snapshot => {
        if(snapshot.docs.length == 0) return;

        const call = snapshot.docs[0].data() as Call;

        if(new Date().valueOf() - call.timestamp > (1000 * 60 * 5)) return; //old call
        if(call.received) return;

        console.log("received")

        await snapshot.docs[0].ref.update({ received: true });

        const result = await runCommand(call.command, call.instance);

        console.log("result")

        await snapshot.docs[0].ref.update({ result: result });
    });
}