import { SlashCommandBuilder } from "discord.js";
import { Command } from "commander";
import { Data, TextCommand } from "../discord";

export const data: Data[] = [
    {
        type: 'slash',
        name: 'ping',
        command: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Replies with Pong!'),
    },
    {
        type: 'text',
        name: 'ping',
        command: () => {
            const command = new Command('ping');
            command.description('Replies with Pong!');
            command.action(() => { });

            const subcommand = new Command('foo');
            subcommand.description('Replies with Bar!');
            subcommand.action(() => { });

            command.addCommand(subcommand);
            return command;
        },
    },
    {
        type: 'reaction',
        name: 'ping',
        command: '🏓',
    }
]

export async function execute(interaction: TextCommand | any) {
    if (interaction.type === 'text') {
        const subcommand = interaction.program.args[0];
        if (subcommand === 'foo') {
            await interaction.reply('Bar!');
        } else {
            await interaction.reply('Pong!');
        }
    } else {
        await interaction.reply('Pong!');
    }
}
