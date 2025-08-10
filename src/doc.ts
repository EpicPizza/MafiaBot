import { Colors, EmbedBuilder, Message, MessageActionRowComponent } from "discord.js";
import { getClient } from "./google";
import { google } from "googleapis";
import { firebaseAdmin } from "./firebase";
import { Cache, removeReactions } from "./discord";

const googleDocIdRegex = /docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9-_]+)/g;

export async function clearFiles() {
    const client = getClient();
    if(client == undefined) return;
    const service = google.drive({ version: 'v3', auth: client });

    const db = firebaseAdmin.getFirestore();
    const collection = db.collection('snipe');
    const docs = (await collection.get()).docs;
    
    await Promise.all(docs.filter(doc => doc.data().failed == false).map(async doc => {
        await service.files.delete({
            fileId: doc.data().id as string,
        });
    }));

    await Promise.all(docs.map(async doc => {
        await doc.ref.delete();
    }));
}   

export async function snipeMessage(message: Message): Promise<EmbedBuilder[]> {
    const links = [] as { type: string, id: string}[];

    while (true) {
        const match = googleDocIdRegex.exec(message.content);
        if(match == null) break;

        links.push({
            type: match[0].substring(match[0].indexOf("m/") + 2, match[0].indexOf("/d/")),
            id: match[1]
        });
    }

    const db = firebaseAdmin.getFirestore();
    const collection = db.collection('snipe');

    const promises = await Promise.allSettled(links.map(async link => {
        const ref = collection.doc(link.id);
        const data = (await ref.get()).data();

        if(data == undefined) throw new Error("Not found!");
        if(data.failed == true) throw new Error("Failed!");

        return data as {
            failed: false,
            id: string,
            link: string,
            name: string,
            type: string,
            timestamp: number,
        }
    }));

    const docs = promises.filter(promise => promise.status == 'fulfilled').map(promise => promise.value);

    const embeds = docs.map(doc => {
        return new EmbedBuilder()
            .setAuthor({ name: "Doc Snipe" })
            .setTitle(doc.name)
            .setURL(doc.link)
            .setColor(Colors.DarkBlue)
            .setDescription('This ' + doc.type + ' was saved on <t:' + Math.floor(doc.timestamp / 1000) + ':f>.')
    })    

    return embeds;
}

export async function checkMessage(message: Message, cache: Cache) {
    if(message.author && message.author.bot == true) return;
    if(cache.channel && cache.channel.id != message.channelId) return;
    if(!cache.started) return;

    const client = getClient();
    if(client == undefined) return;
    const service = google.drive({ version: 'v3', auth: client });

    const links = [] as { type: string, id: string}[];

    while (true) {
        const match = googleDocIdRegex.exec(message.content);
        if(match == null) break;

        links.push({
            type: match[0].substring(match[0].indexOf("m/") + 2, match[0].indexOf("/d/")),
            id: match[1]
        });
    }

    const db = firebaseAdmin.getFirestore();
    const ref = db.collection('snipe');
    const refs = await ref.listDocuments();

    const newLinks = links.filter(link => !refs.find(ref => ref.id == link.id));

    if(newLinks.length == 0) return;

    await message.react("<a:loading:1256150236112621578>");
    
    const promises = await Promise.allSettled(newLinks.map(link => service.files.copy({
        fileId: link.id,
        requestBody: {
            parents: [ "root" ],
        },
        fields: 'id, name, webViewLink'
    })));

    await Promise.all(promises.map(async (promise, i) => {
        const link = newLinks[i];

        if(promise.status == 'rejected') {
            await ref.doc(link.id).set({
                failed: true,
                reason: promise.reason.message,
            });
        } else {
            await ref.doc(link.id).set({
                failed: false,
                link: promise.value.data.webViewLink,
                id: promise.value.data.id,
                name: promise.value.data.name,
                timestamp: new Date().valueOf(),
                type: link.type == 'spreadsheets' ? 'spreadsheet' : link.type,
            });

            await service.permissions.create({
                fileId: promise.value.data.id ?? "---",
                requestBody: {
                    type: 'anyone',
                    role: 'reader',
                }
            });
        }
    }));

    await removeReactions(message);
    await message.react('💾');
}