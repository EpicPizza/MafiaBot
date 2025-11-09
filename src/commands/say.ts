import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data } from '../discord';
import { TextCommand } from '../discord';
import { simpleJoin } from '../utils/text';
import { fromZod } from '../utils/text';
import client from "../discord/client";
import { getGlobal } from '../utils/global';
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-say',
            /*command: {
                required: [ z.string(), z.string() ],
                optional: [ "*" ]
            }*/
            command: () => {
                return new Command()
                    .name('say')
                    .description('have the bot say something in a channel')
                    .requiredOption('-g, --guild <snowflake>', 'the guild id ** **', fromZod(z.string()))
                    .requiredOption('-c, --channel <snowflake>', 'the channel id ** **', fromZod(z.string()))
                    .argument('<message...>', 'the message to send', simpleJoin)
            }
        },
        {
            type: 'slash',
            name: 'slash-say',
            command: new SlashCommandBuilder()
                .setName('say')
                .setDescription('Have the bot say something in a channel.')
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

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const setup = await getSetup();
        const global = await getGlobal();

        let guildId: string;
        let channelId: string;
        let message: string;

        if (interaction.type == 'text') {
            await checkMod(setup, global, interaction.user.id, interaction.message?.guild?.id ?? "");

            if (interaction.program.processedArgs.length < 1) throw new Error("No message to send?");

            guildId = interaction.program.getOptionValue('guild') as string;
            channelId = interaction.program.getOptionValue('channel') as string;
            message = interaction.program.processedArgs[0] as string;
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

        if (interaction.type == 'text') {
            await interaction.message.react("✅");
        } else {
            await interaction.reply({ content: "Message sent.", ephemeral: true });
        }
    }
}