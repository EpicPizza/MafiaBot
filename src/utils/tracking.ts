import { Message } from "discord.js";
import { FieldValue } from "firebase-admin/firestore";
import { firebaseAdmin } from "../firebase";
import { Cache } from "../discord";

export async function trackMessage(message: Message, cache: Cache) {
    const db = firebaseAdmin.getFirestore();

    if(message.author && message.author.bot == true) return;
    
    if(cache.channel && cache.channel.id != message.channelId) return;

    if(!cache.started) return;

    const ref = db.collection('day').doc(cache.day.toString()).collection('players').doc(message.author.id);

    if((await ref.get()).exists) {
        ref.update({
            messages: FieldValue.increment(1),
            words: FieldValue.increment(message.content.split(" ").length),
        })
    } else {
        ref.set({
            messages: FieldValue.increment(1),
            words: FieldValue.increment(message.content.split(" ").length),
        })
    }
}