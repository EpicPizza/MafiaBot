import { DocumentReference } from "firebase-admin/firestore";
import { firebaseAdmin } from "./firebase";
import { NewsChannel, StageChannel, TextChannel, VoiceChannel, WebhookClient } from "discord.js";

export async function getWebhook(channel: NewsChannel | TextChannel | VoiceChannel | StageChannel) {
    const db = firebaseAdmin.getFirestore();

    const webhooks = (await db.collection('webhooks').doc(channel.guildId).collection('channels').where('channel', '==', channel.id).get()).docs.map(doc => ({ ...doc.data(), ref: doc.ref })) as { channel: string, token: string, id: string, ref: DocumentReference }[];

    let webhookClient: WebhookClient | undefined = undefined;

    if (webhooks.length > 0) {
        const currentWebhooks = await channel.fetchWebhooks();

        if (currentWebhooks.find(webhook => webhook.id == webhooks[0].id)) {
            webhookClient = new WebhookClient({
                token: webhooks[0].token,
                id: webhooks[0].id
            })
        }
    }

    if (webhookClient == undefined) {
        const webhook = await channel.createWebhook({
            name: 'Mafia Bot Services',
        });

        if (webhook.token == null) throw new Error("Webhook creation error.");

        webhookClient = new WebhookClient({
            id: webhook.id,
            token: webhook.token,
        });
    }

    if (!webhooks.find(webhook => webhook.id == webhookClient.id)) {
        await Promise.allSettled(webhooks.map(webhook => webhook.ref.delete()));

        await db.collection('webhooks').doc(channel.guildId).collection('channels').add({
            id: webhookClient.id,
            token: webhookClient.token,
            channel: channel.id,
        });
    }

    return {
        client: webhookClient,
        destroy: () => { webhookClient.destroy(); },
    }
}