import { Command } from "commander";
import { fromJSON, runCommand } from "../api/spoof";
import { Data, TextCommand } from '../discord';
import { getGlobal } from "../utils/global";
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";

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

    execute: async (interaction: TextCommand) => {
        const setup = await getSetup();
        const global = await getGlobal();

        await checkMod(setup, global, interaction.user.id, interaction.message.guildId ?? "---");

        const result = await runCommand(interaction.program.processedArgs[0], setup);

        await interaction.reply({
            files: fromJSON(result),
        });
    }
}