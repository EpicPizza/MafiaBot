import { ButtonInteraction, ChatInputCommandInteraction, InteractionType, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, StringSelectMenuInteraction } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { LockCommand, LockingSelect, UnlockButton, UnlockCommand } from "./lock";
import { ZodObject, ZodSchema, z } from "zod";
import { CloseCommand, OpenCommand, ReactivateButton, SignupsCommand } from "./signups";
import { ArchiveCommand, CreateCommand } from "./game";
import { EndCommand } from "./end";
import { StartCommand } from "./start";
import { KickCommand, SpectatorCommand } from "./invite";
import { RemoveCommand } from "./remove";
import { ChangeAlignmentButton, ConfirmAllignmentsButton } from "./alignments";
import { ExtensionCommand } from "./extension";

export function ModCommand() {
    const commands = [ LockCommand, UnlockCommand, CloseCommand, OpenCommand, CreateCommand, EndCommand, StartCommand, SignupsCommand, SpectatorCommand, KickCommand, RemoveCommand, ExtensionCommand, ArchiveCommand ] as { name: string, description?: string, execute: Function, command: { slash: SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder, text: TextCommandArguments } }[];
    const interactions = [ LockingSelect, UnlockButton, ReactivateButton, ConfirmAllignmentsButton, ChangeAlignmentButton ] as { name: string, type: string, command: ZodObject<any>, execute: Function }[];

    function getBuilders() {
        return commands.map(command => command.command.slash)
    }

    function getInteractions() {
        return interactions.map(interaction => ({ name: interaction.name, type: interaction.type as "select" | "button", command: interaction.command }) )
    }

    function getTextCommand() {
        return {
            type: "text" as "text",
            name: "text-mod",
            command: {
                required: [ z.string().min(1).max(20) ],
                optional: Array(100).fill(true)
            }
        }
    }

    async function handleCommand(interaction: Command | ChatInputCommandInteraction) {
        const name = interaction.type == 'text' ? interaction.arguments[0] as string : interaction.options.getSubcommandGroup() ?? interaction.options.getSubcommand();

        const command = commands.find(command => command.name == name);

        if(command == undefined) return await interaction.reply("Mod subcommand not found.");

        if(interaction.type == 'text') {
            const parsedValues = [] as (number | string | boolean)[];

            if((command.command.text.required && command.command.text.required.length != 0) || (command.command.text.optional && command.command.text.optional.length != 0)) {
                const values = interaction.arguments.filter((argument, i) => i > 0);

                const optionalLength = command.command.text.optional ? command.command.text.optional.length : 0;
                const requiredLength = command.command.text.required ? command.command.text.required.length : 0;

                if(values.length > optionalLength + requiredLength || values.length < requiredLength) throw new Error(`Invalid argument for text command, ` + (command.description != undefined ? `**${command.description}**` : `${name}.`));

                console.log(values);

                if(values.length != 0) {
                    for(let i = 0; i < values.length; i++) {
                        try {
                            if(i >= requiredLength && command.command.text.optional) {
                                const part = command.command.text.optional[i - requiredLength];
                                parsedValues.push(part === true ? values[i] : part.parse(values[i]));
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

        if(command == undefined) return await interaction.reply("Mod interaction not found.");

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