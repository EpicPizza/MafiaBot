import { Command } from "commander";
import { randomInt } from "crypto";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { firebaseAdmin } from "../utils/firebase";
import { getUser, User } from "../utils/mafia/user";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-hint',
            command: new SlashCommandBuilder()
                .setName("hint")
                .setDescription("Get a hint.")
        },
        {
            type: 'text',
            name: 'text-hint',
            command: () => {
                return new Command()
                    .name('hint')
                    .description('get a hint')
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        interaction.inInstance();

        let user = null as null | User;

        const global = interaction.instance.global;

        if(global.started == true) {
            const randomPlayer = getRandom(0, global.players.length);

            user = await getUser(global.players[randomPlayer].id, interaction.instance) ?? null;
        } else {
            const db = firebaseAdmin.getFirestore();

            const count = (await db.collection('instances').doc(interaction.instance.id).collection("users").count().get()).data().count;

            const randomPlayer = getRandom(0, count);

            user = await getUser((await db.collection('instances').doc(interaction.instance.id).collection("users").offset(randomPlayer).limit(1).get()).docs[0].data().id, interaction.instance) ?? null;
        }

        if(user == null) throw new Error("User not found.");
        
        let use2POV = getRandom(1, 11) >= 7; // 70%, the chance for using second person
        let useID = getRandom(1, 11) >= 1 // 10%, the chance of using an identity hint
        let sentence = use2POV ? "You": user.nickname; // the subject of the sentence
        sentence += useID ? use2POV ? " are " : " is " : "";
        let ids = ["alive", "dead", "mafia", "town", "vigilante", "doctor", "cop", "jester", "cooked", "favored by mod"];
        let verbs = ["will be hammered", "will meow", "will be killed", "will be healed", "will be voted out"];
        sentence += useID ? ids[getRandom(0, ids.length)] : verbs[getRandom(0, verbs.length)];
        sentence += ".";
        return await interaction.reply(sentence);
    }
}

function getRandom(min: number, max: number) {
    return randomInt(min, max);
}
