import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";
import { getGlobal } from "../utils/main";
import { getUser } from "../utils/user";
import { Command } from "../utils/commands";

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

        const global = await getGlobal();

        if(global.started == false) throw new Error("Game has not started.");

        const randomPlayer = getRandom(0, global.players.length);

        const user = await getUser(global.players[randomPlayer].id);

        if(user == undefined) throw new Error("User not found.");

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
    return Math.floor((Math.random() * (max - min) + min));
}