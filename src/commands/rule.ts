import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data, Command } from "../discord";
import { z } from "zod";
import { getRule, getRules } from "../utils/rules";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-rules',
            command: new SlashCommandBuilder()
                .setName("rules")
                .setDescription("All the rules of mafia.")
        },
        { 
            type: 'slash',
            name: 'slash-rule',
            command: new SlashCommandBuilder()
                .setName("rule")
                .setDescription("Get a specific rule.")
                .addNumberOption(option =>
                    option
                        .setName('number')
                        .setDescription('What rule number?')
                        .setMinValue(1)
                        .setRequired(true)
                )
        },
        {
            type: 'text',
            name: 'text-rules',
            command: {}
        },
        {
            type: 'text',
            name: 'text-rule',
            command: {
                required: [ z.coerce.number().min(1).int() ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | Command) => {
        const ruleNumber = interaction.type == 'text' ? 
            (interaction.arguments.length > 0 ? interaction.arguments[0] as number : -1) :
            Math.floor(interaction.options.getNumber('number') ?? -1);

        if(ruleNumber < 1 && ruleNumber != -1) throw new Error("Invalid rule number!");

        let embed: EmbedBuilder;

        if(ruleNumber == -1) {
            embed = new EmbedBuilder()
                .setTitle('Rules')
                .setColor(Colors.Orange)
                .setDescription(await getRules());
        } else {
            embed = new EmbedBuilder()
                .setTitle('Rule ' + ruleNumber)
                .setColor(Colors.Orange)
                .setDescription(await getRule(ruleNumber - 1));
        }

        await interaction.reply({ embeds: [embed] });
    }
}