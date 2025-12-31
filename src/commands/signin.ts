import { Command } from "commander";
import { randomInt } from "crypto";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { firebaseAdmin } from "../utils/firebase";
import { getUser, User } from "../utils/mafia/user";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-signin',
            command: new SlashCommandBuilder()
                .setName("signin")
                .setDescription("signin ig")
        },
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction) => {
        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('sessions').doc(interaction.user.id);

        const token = crypto.randomUUID();

        await ref.set({
            token: token,
            timestamp: new Date().valueOf(),
        }, { merge: true });

        const url = new URL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN ?? "-" : process.env.DOMAIN ?? "-") + "/session/discord");

        url.searchParams.set("id", interaction.user.id);
        url.searchParams.set("token", token);

        await interaction.reply({
            content: "<" + url.toString() + ">",
            ephemeral: true,
        })
    }
}