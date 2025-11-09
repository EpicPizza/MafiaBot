import { Command } from "commander";
import { Colors, EmbedBuilder } from "discord.js";
import { z } from "zod";
import { Data, TextCommand } from '../discord';
import client from "../discord/client";
import { getEnabledExtensions } from "../utils/extensions";
import { getGlobal } from '../utils/global';
import { isMod } from "../utils/mod";
import { getSetup } from "../utils/setup";
import { fromZod } from "../utils/text";

module.exports = {
    data: [
        { 
            type: 'text',
            name: 'text-command',
            command: () => {
                return new Command()
                    .name('command')
                    .description('how to use a command')
                    .argument('[command]', 'which command', fromZod(z.string().min(1).max(100)))  
            }
        }
    ] satisfies Data[],

    execute: async (interaction: TextCommand ) => {
        const global = await getGlobal();

        const extensions = await getEnabledExtensions(global);

        const mod = await isMod(await getSetup(), global, interaction.user.id, (interaction.message.guildId) ?? "");

        const command = interaction.program.processedArgs[0] ?? null;

        if(command == null) throw new Error("Must declare command.");

        const help = client.help.get('help-' + command);

        if(help == undefined) throw new Error("Command (or help description) not found.");
        
        const formattedArgumentsText = help.arguments.filter(argument => argument.type == 'text').reduce((acc: string, arg: { name: string, description: string }) => `${acc}　　\`${arg.name}\` - ${arg.description}\n`, '');
        const formattedArgumentsSlash = help.arguments.filter(argument => argument.type == 'slash').reduce((acc: string, arg: { name: string, description: string }) => `${acc}　　\`${arg.name}\` - ${arg.description}\n`, '');

        const embed = new EmbedBuilder()
            .setTitle(help.shorthand)
            .setDescription(help.description + "\n\n`" + help.text?.trim() + '`\n' + (formattedArgumentsText == "" ? "　　No Additional Arguments\n" : formattedArgumentsText) + "\n`" + help.slash?.trim() + "`\n" + (formattedArgumentsSlash == "" ? "　　No Additional Arguments\n" : formattedArgumentsSlash))
            .setColor(Colors.Yellow);

        interaction.reply({ embeds: [embed] });
    }
}