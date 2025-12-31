import { Command } from "commander";
import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { fromZod } from '../utils/text';
import { getRule, getRules } from "../utils/mafia/rules";

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
            command: () => {
                return new Command()
                    .name('rules')
                    .description('Show all the rules.')
            }
        },
        {
            type: 'text',
            name: 'text-rule',
            command: () => {
                return new Command()
                    .name('rule')
                    .description('Show a certain rule.')
                    .argument('<number>', 'rule number', fromZod(z.coerce.number()));
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | TextCommand>) => {
        const ruleNumber = interaction.type == 'text' ? 
            (interaction.program.processedArgs.length > 0 ? interaction.program.processedArgs[0] as number : -1) :
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