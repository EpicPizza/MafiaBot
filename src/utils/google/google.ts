import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { firebaseAdmin } from "../firebase";
import { Credentials, OAuth2Client } from "google-auth-library";
import { isDisabled } from "../../disable";

let unsubscribe: undefined | (() => void) = undefined;
let client: undefined | OAuth2Client = undefined;

export function getClient(): typeof client {
    return client;
}

function resetClient(newClient: typeof client) {
    if(client) client.removeAllListeners();

    client = newClient;
}

export async function init() {
    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('google').doc('tokens');

    if(unsubscribe) unsubscribe();

    unsubscribe = ref.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if(!snapshot.exists || data == undefined) return;

        const tokens = JSON.parse((await decrypt(data.value, data.iv)).value) as Credentials;
        const keys = JSON.parse(process.env.GOOGLE_CLIENT as string);

        console.log("INIT", tokens);

        const client = new OAuth2Client({
            clientId: keys.web.client_id,
            clientSecret: keys.web.client_secret,
            redirectUri: keys.web.redirect_uris[0],
        });

        client.setCredentials(tokens);

        resetClient(client);

        if(unsubscribe) unsubscribe();

        client.on('tokens', async (newTokens) => {
            const data = (await ref.get()).data();
            if(data == undefined) return;

            const currentTokens = JSON.parse((await decrypt(data.value, data.iv)).value) as Credentials;

            if(newTokens.access_token) currentTokens.access_token = newTokens.access_token;
            if(newTokens.refresh_token) currentTokens.refresh_token = newTokens.refresh_token;
            if(newTokens.expiry_date) currentTokens.expiry_date = newTokens.expiry_date;

            console.log("NEW", newTokens);
            console.log("CURRENT", currentTokens);

            const encrypted = await encrypt(JSON.stringify(currentTokens));

            await ref.set({
                value: encrypted.encryptedValue,
                iv: encrypted.iv,
            });
        });
    });
}

export async function encrypt(value: string) {
	const key = Buffer.from(process.env.GOOGLE_KEY as unknown as string, "hex");
	const iv = randomBytes(16);

	const cipher = createCipheriv("aes-256-cbc", key, iv);

	const encryptedValue =
		cipher.update(value, "utf8", "hex") + cipher.final("hex");

	return { encryptedValue, iv: iv.toString("hex") };
}

export async function decrypt(encryptedValue: string, iv: string) {
	const key = Buffer.from(process.env.GOOGLE_KEY as unknown as string, "hex");

	const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(iv, "hex"));

	const value =
		decipher.update(encryptedValue, "hex", "utf8") + decipher.final("utf8");

	return { value };
}

if(!isDisabled()) init();