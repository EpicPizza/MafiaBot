import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import client, { Data } from "../discord";
import { getGlobal } from "../utils/main";
import { getUser, User } from "../utils/user";
import { Command } from "../discord";
import { firebaseAdmin } from "../firebase";
import { z } from "zod";
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-say',
            command: {
                required: [ z.string(), z.string() ],
                optional: [ "*" ]
            }
        },
        {
            type: 'slash',
            name: 'slash-say',
            command: new SlashCommandBuilder()
                .setName('say')
                .setDescription('Has the bot say something in a channel.')
                .addStringOption(option =>
                    option.setName('guild')
                        .setDescription('The guild id to send the message in.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('channel')
                        .setDescription('The channel id to send the message in.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('The message to send.')
                        .setRequired(true)
                )
        }
    ] satisfies Data[],

    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const setup = await getSetup();
        const global = await getGlobal();

        let guildId: string;
        let channelId: string;
        let message: string;

        if ('arguments' in interaction) {
            // Text command
            await checkMod(setup, global, interaction.user.id, interaction.message?.guild?.id ?? "");
            if (interaction.arguments.length < 3) throw new Error("No message to send?");
            guildId = interaction.arguments[0] as string;
            channelId = interaction.arguments[1] as string;
            message = interaction.arguments[2] as string;
        } else {
            // Slash command
            await checkMod(setup, global, interaction.user.id, interaction.guildId ?? "");
            guildId = interaction.options.getString('guild', true);
            channelId = interaction.options.getString('channel', true);
            message = interaction.options.getString('message', true);
        }

        const guild = client.guilds.cache.get(guildId);

        if (guild == undefined) throw new Error("Guild not found.");

        const channel = guild.channels.cache.get(channelId);

        if (channel == undefined) throw new Error("Channel not found.");

        if (!channel.isTextBased()) throw new Error("Can't send a message in this non text based channel?");

        await channel.send(message);

        if ('arguments' in interaction) {
            await interaction.message.react("✅");
        } else {
            await interaction.reply({ content: "Message sent.", ephemeral: true });
        }
    }
}