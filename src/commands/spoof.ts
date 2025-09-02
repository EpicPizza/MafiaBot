import { Command } from "commander";
import { createMessage, transform } from "../api/spoof";
import { Data, TextCommand } from '../discord';
import { messageCreateHandler } from "../discord/message";
import { getSetup } from "../utils/setup";
import client from "../discord/client";
import { checkMod } from "../utils/mod";
import { getGlobal } from "../utils/global";

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

        const result = await new Promise(async (resolve) => {
            const message = await createMessage(setup, interaction.user, interaction.program.processedArgs[0], {
                onReact: (emoji) => {
                    console.log(emoji)

                    if(emoji == "<a:loading:1256150236112621578>") return;

                    resolve({
                        reaction: emoji,
                    });
                },
                onReply: (options) => {
                    const data = transform(options);

                    resolve(data);
                }
            })

            try {
                await messageCreateHandler(message, true);
            } catch(e: any) {
                resolve({
                    content: e.message as string,
                })
            }
        });

        const buffer = Buffer.from(JSON.stringify(result, null, 2), 'utf-8');

        await interaction.reply({
            files: [{
                attachment: buffer,
                name: 'result.json'
            }]
        });
    }
}