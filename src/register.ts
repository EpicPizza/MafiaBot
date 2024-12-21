import { REST, Routes, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import type { Data } from './discord';

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
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(process.env.DEV == 'TRUE' ? process.env.DEVTOKEN as string : process.env.TOKEN as string);

    // and deploy your commands!
    (async () => {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);

            // The put method is used to fully refresh all commands in the guild with the current set
            //await rest.put(Routes.applicationCommands(process.env.DEV == 'TRUE' ? process.env.DEVCLIENT as string : process.env.CLIENT as string), { body: [] });

            const data = await rest.put(
                (process.env.DEV == 'FALSE') ? Routes.applicationGuildCommands(process.env.DEVCLIENT as string, process.env.DEVGUILD as string) : Routes.applicationCommands(process.env.DEVCLIENT as string),
                { body: {} },
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