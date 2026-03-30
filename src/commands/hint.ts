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
        
        
        let use2POV = getRandom(1, 11) >= 7; // 30%, the chance for using second person
        let hints : [string, number, string, number?][] = [ // typescript pmo
            ["alive", 10, "is"],
            ["dead", 10, "is"],
            ["mafia", 10, "is"],
            ["town", 10, "is"],
            ["vigilante", 10, "is"],
            ["doctor", 10, "is"],
            ["jester", 10, "is"],
            ["cooked", 10, "is"],
            ["cooking", 5, "is"],
            ["throwing", 5, "is"],
            ["wrong", 8, "is"],
            ["lying", 8, "is"],
            ["telling the truth", 15, "is"],
            ["not Snek", 1, "is"],
            ["being rooted for by mod", 1, "is"],
            
            ["will be hammered", 10, ""],
            ["will meow", 3, ""],
            ["will die soon", 2, ""],
            ["will be protected", 2, ""],
            ["will be voted out", 2, ""],
            ["got the good role", 1, ""],
            
            
            ["doomed", 2, "was"],
            ["meowing", 2, "was"],
            
            ["meowed", 10, "had"],
            ["won", 2, "had"],
            ["lost", 2, "had"],
            
            ["understand typescript", 1, "doesn't"],
        ];
        
        let sum = 0;
        for (let hint of hints) {
            sum += hint[1];
            hint.push(sum);
        }
        
        let random = getRandom(0, sum);
        
        for (let hint of hints) {
            if ((hint[3] || 0) < random) { // typescript pmo
                return await interaction.reply(
                    (use2POV ? "You " + {
                        is: "are",
                        "": "",
                        was: "were",
                        had: "have",
                        "doesn't": "don't",
                    }[hint[2]]: user.nickname + " " + hint[2]) + hint[0] + "."
                )
            }
        }
        
        return await interaction.reply("Snek's program has problems.");
    }
}

function getRandom(min: number, max: number) {
    return randomInt(min, max);
}
