import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { getGlobal } from '../../utils/global';
import { wipe } from "../../utils/mafia/vote";
import { getSetup } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";
import { getGameByID } from "../../utils/mafia/games";

export const WipeCommand = {
    name: "wipe",
    subcommand: true,

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
    text: () => {
        return new Command()
            .name('wipe')
            .description('Wipe all votes in a day, message is what appears in vote history (optional).')
            .argument('<day>', 'which day', fromZod(z.coerce.number()))
            .argument('[message]', 'message to put in logs')
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply();
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();

        const game = await getGameByID(global.game ?? "---");
        if(game == undefined) throw new Error("Game not found!");

        if(setup.primary.chat.id != (interaction.type == 'text' ? interaction.message.channelId : interaction.channelId )) throw new Error("Must be in main chat!");
        if(global.started == false) throw new Error("Game has not started.");

        const day = interaction.type == 'text' ? interaction.program.processedArgs[0] as number : interaction.options.getNumber("day");
        if(day == null) throw new Error("Day not specified.");

        const message = interaction.type == 'text' ? (interaction.program.args.length > 1 ? interaction.program.processedArgs[2] as string ?? "" : "") : interaction.options.getString('message') ?? "";

        const setMessage = await wipe(global, message, game);

        if(interaction.type != 'text') {
            const message = await interaction.editReply({ content: "Day wiped."});

            await setMessage(message.id);
        } else {
            await removeReactions(interaction.message);

            await setMessage(interaction.message.id);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;