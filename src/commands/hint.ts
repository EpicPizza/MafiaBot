import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { getGlobal } from "../utils/main";
import { getUser, User } from "../utils/user";
import { Command } from "../discord";
import { firebaseAdmin } from "../firebase";
import { randomInt } from "crypto";

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
            command: {}
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | Command) => {
        const random = getRandom(1, 11);

        let user = null as null | User;

        const global = await getGlobal();

        if(global.started == true) {
            const randomPlayer = getRandom(0, global.players.length);

            user = await getUser(global.players[randomPlayer].id) ?? null;
        } else {
            const db = firebaseAdmin.getFirestore();

            const count = (await db.collection("users").count().get()).data().count;

            const randomPlayer = getRandom(0, count);

            user = await getUser((await db.collection("users").offset(randomPlayer).limit(1).get()).docs[0].data().id) ?? null;
        }

        if(user == null) throw new Error("User not found.");

        switch(random) {
            case 1:
                return await interaction.reply(user.nickname + " is alive.");
            case 2:
                return await interaction.reply(user.nickname + " is dead.");
            case 3:
                return await interaction.reply(user.nickname + " is mafia.");
            case 4:
                return await interaction.reply(user.nickname + " is jester.");
            case 5:
                return await interaction.reply(user.nickname + " is vigilante.");
            case 6:
                return await interaction.reply(user.nickname + " is town.");
            case 7:
                return await interaction.reply(user.nickname + " will be hammered.");
            case 8:
                return await interaction.reply("You are mafia.");
            case 9:
                return await interaction.reply("You are town.");
            case 10:
                return await interaction.reply("You are cooked.");
        }
    }
}

function getRandom(min: number, max: number) {
    return randomInt(min, max);
}