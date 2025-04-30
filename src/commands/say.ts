import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import client, { Data } from "../discord";
import { getGlobal } from "../utils/main";
import { getUser, User } from "../utils/user";
import { Command } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-say',
            command: {
                required: [ z.string(), z.string() ],
                optional: [ "*" ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Command) => {
        if(interaction.arguments.length < 3) throw new Error("No message to send?");

        const guild = client.guilds.cache.get(interaction.arguments[0] as string);

        if(guild == undefined) throw new Error("Guild not found.");

        const channel = guild.channels.cache.get(interaction.arguments[1] as string);

        if(channel == undefined) throw new Error("Channel not found.");

        if(!channel.isTextBased()) throw new Error("Can't send a message in this non text based channel?");

        await channel.send(interaction.arguments[2] as string);
        
        await interaction.message.react("✅");
    }
}