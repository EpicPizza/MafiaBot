import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import type { Data } from './discord';
import dotenv from 'dotenv';

dotenv.config();

export async function register(exit: boolean = false) {
    const commands = [] as any[];

    // Grab all the command files from the commands directory you created earlier
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);

        const command = require(filePath);

        const data: Data[] = command.data;

        if ('data' in command && 'execute' in command ) {
            for(const command of data) {
                if(command.type == 'slash' || command.type == 'context') {
                    if(typeof command.command == 'function') {
                        commands.push((await command.command()).toJSON());
                    } else {
                        commands.push(command.command.toJSON());
                    }
                }
            };
        } else {
            console.log(`[WARNING] The comand at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(process.env.TOKEN as string);

    // and deploy your commands!
    (async () => {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);

            // The put method is used to fully refresh all commands in the guild with the current set
            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID as string),
                { body: commands },
            ) as any[];

            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            // And of course, make sure you catch and log any errors!
            console.error(error);
        }

        if(exit) {
            process.exit();
        }
    })();
}
