import { Command } from "commander";
import { fromJSON, runCommand } from "../api/spoof";
import { Data, Event, TextCommand } from '../discord';
import { checkMod } from "../utils/mod";

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-spoof',
            command: () => {
                return new Command()
                    .name('spoof')
                    .description('doing something interesting?')
                    .argument('<command>', 'text command to run')
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Event<TextCommand>) => {
        interaction.inInstance();

        const setup = interaction.instance.setup
        const global = interaction.instance.global;

        await checkMod(setup, global, interaction.user.id, interaction.message.guildId ?? "---");

        const result = await runCommand(interaction.program.processedArgs[0], interaction.instance.id);

        await interaction.reply({
            files: fromJSON(result),
        });
    }
}