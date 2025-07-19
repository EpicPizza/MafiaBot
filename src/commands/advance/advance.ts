import { ButtonInteraction, ChatInputCommandInteraction, InteractionType, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, StringSelectMenuInteraction } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { ZodObject, ZodSchema, z } from "zod";
import { ExtensionCommand } from "./extension";
import { TriggerCommand } from "./trigger";
import { AddCommand } from "./add";
import { MafiaCommand } from "./mafia";
import { ClearCommand, DayCommand, WipeCommand } from "./day";
import { KillCommand } from "./kill";
//import { VoteCommand } from "./vote";
import { AlignmentCommand } from "./alignment";
import { InviteCommand, RoleCommand } from "./role";

export function AdvanceCommand() {
    const commands = [ ExtensionCommand, TriggerCommand, AddCommand, MafiaCommand, DayCommand, ClearCommand, KillCommand, AlignmentCommand, RoleCommand, InviteCommand, WipeCommand ] as { name: string, description?: string, execute: Function, command: { slash: SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder, text: TextCommandArguments } }[];
    const interactions = [  ] as { name: string, type: string, command: ZodObject<any>, execute: Function }[];

    function getBuilders() {
        return commands.map(command => command.command.slash)
    }

    function getInteractions() {
        return interactions.map(interaction => ({ name: interaction.name, type: interaction.type as "select" | "button", command: interaction.command }) )
    }

    function getTextCommand() {
        return {
            type: "text" as "text",
            name: "text-adv",
            command: {
                required: [ z.string().min(1).max(20) ],
                optional: Array(200).fill(true)
            }
        }
    }

    async function handleCommand(interaction: Command | ChatInputCommandInteraction) {
        const name = interaction.type == 'text' ? interaction.arguments[0] as string : interaction.options.getSubcommandGroup() ?? interaction.options.getSubcommand();

        const command = commands.find(command => command.name == name);

        if(command == undefined) return await interaction.reply("Advance subcommand not found.");

        if(interaction.type == 'text') {
            const parsedValues = [] as (number | string | boolean)[];

            if((command.command.text.required && command.command.text.required.length != 0) || (command.command.text.optional && command.command.text.optional.length != 0)) {
                const values = interaction.arguments.filter((argument, i) => i > 0);

                const limited = !(command.command.text.optional && command.command.text.optional[command.command.text.optional.length - 1] == "*");
                const optionalLength = command.command.text.optional ? (command.command.text.optional[command.command.text.optional.length - 1] == "*" ? 5000 : command.command.text.optional.length) : 0;
                const requiredLength = command.command.text.required ? command.command.text.required.length : 0;

                if(values.length > optionalLength + requiredLength || values.length < requiredLength) throw new Error(`Invalid argument for text command, ` + (command.description != undefined ? `**${command.description}**` : `${name}.`));

                console.log(values);

                if(values.length != 0) {
                    for(let i = 0; i < values.length; i++) {
                        try {
                            if(i >= requiredLength && command.command.text.optional) {
                                const part = command.command.text.optional[i - requiredLength];
                                

                                if(!limited && part != "*") {
                                    parsedValues.push(part === true ? values[i] : part.parse(values[i]));
                                    continue;
                                }

                                if(!limited && i - requiredLength == command.command.text.optional.length - 1) {
                                    parsedValues.push(values[i]);
                                } else if(!limited && i - requiredLength >= command.command.text.optional.length) {
                                    parsedValues[parsedValues.length - 1] += " " + values[i];
                                } else if(part != "*") {
                                    parsedValues.push(part === true ? values[i] : part.parse(values[i]));
                                }
                            } else if(command.command.text.required) {
                                const part = command.command.text.required[i];
                                parsedValues.push(part === true ? values[i] : part.parse(values[i]));
                            }
                        } catch(e) {
                            console.log(e);
                
                            throw new Error(`Invalid argument for text command, ` + (command.description != undefined ? `**${command.description}**` : `${name}.`));
                        }
                    }
                }
            }

            interaction.arguments = [ interaction.arguments[0], ...parsedValues ];
        }

        await command.execute(interaction);
    }

    async function handleInteraction(interaction: StringSelectMenuInteraction | ButtonInteraction) {
        const name = (interaction.isButton() ? "button-" : "select-" ) + JSON.parse(interaction.customId).name;

        const command = interactions.find(interaction => interaction.name == name);

        if(command == undefined) return await interaction.reply("Advance interaction not found.");

        await command.execute(interaction);
    }

    return {
        getBuilders,
        getTextCommand,
        handleCommand,
        getInteractions,
        handleInteraction
    }
}