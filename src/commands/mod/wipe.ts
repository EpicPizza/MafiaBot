import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { deleteCollection, getGlobal } from "../../utils/main";
import { getSetup } from "../../utils/setup";
import { z } from "zod";
import { wipe } from "../../utils/vote";

export const WipeCommand = {
    name: "wipe",
    description: "?mod wipe {day} {message}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("wipe")
            .setDescription("Clear a day's votes.")
            .addNumberOption(option =>
                option
                    .setName("day")
                    .setDescription("Which day to clear.")
                    .setRequired(true)
            )
            .addStringOption(option => 
                option
                    .setName('message')
                    .setDescription("Message to put in logs.")
            ),
        text: {
            required: [ z.coerce.number() ],
            optional: [ "*" ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply();
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();

        if(setup.primary.chat.id != (interaction.type == 'text' ? interaction.message.channelId : interaction.channelId )) throw new Error("Must be in main chat!");
        if(global.started == false) throw new Error("Game has not started.");

        const day = interaction.type == 'text' ? interaction.arguments[1] as number : interaction.options.getNumber("day");
        if(day == null) throw new Error("Day not specified.");

        const message = interaction.type == 'text' ? (interaction.arguments.length > 1 ? interaction.arguments[2] as string ?? "" : "") : interaction.options.getString('message') ?? "";

        const setMessage = await wipe(global, message);

        if(interaction.type != 'text') {
            const message = await interaction.editReply({ content: "Day wiped."});

            await setMessage(message.id);
        } else {
            await removeReactions(interaction.message);

            await setMessage(interaction.message.id);

            await interaction.message.react("✅");
        }
    }
}

