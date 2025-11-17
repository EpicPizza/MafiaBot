import { ApplicationCommandOptionType, Colors, EmbedBuilder, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import client from "./client";
import type { Data } from ".";

export interface Help { 
    name: string,
    shorthand: string,
    slash?: string,
    text?: string,
    description: string,
    arguments: { name: string, description: string, type: 'slash' | 'text' }[],
}

export function getHelpEmbed(command: string) {
    const help = client.help.get('help-' + command);

    if(help == undefined) throw new Error("Command (or help description) not found.");
    
    const formattedArgumentsText = help.arguments.filter(argument => argument.type == 'text').reduce((acc: string, arg: { name: string, description: string }) => `${acc}　　\`${arg.name}\` - ${arg.description}\n`, '');
    const formattedArgumentsSlash = help.arguments.filter(argument => argument.type == 'slash').reduce((acc: string, arg: { name: string, description: string }) => `${acc}　　\`${arg.name}\` - ${arg.description}\n`, '');

    const embed = new EmbedBuilder()
        .setTitle(help.shorthand)
        .setDescription(help.description + "\n\n`" + (help.text ? help.text?.trim() + '`\n' + (formattedArgumentsText == "" ? "　　No Additional Arguments\n" : formattedArgumentsText) + "\n" : "") + (help.slash ? "`" + help.slash?.trim() + "`\n" + (formattedArgumentsSlash == "" ? "　　No Additional Arguments\n" : formattedArgumentsSlash) : ""))
        .setColor(Colors.Yellow);

    return embed;
}

export function initHelp(data: Data[]) {
    const helpEntries: { type: 'help', name: string, slash?: true | string, text?: true | string, description?: string }[] = [];

    data.forEach((command) => {
        const commandName = command.name.substring(command.name.indexOf("-") + 1) ;

        switch (command.type) {
            case 'text':
                const existsText = helpEntries.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName);

                if(existsText == undefined) {
                    helpEntries.push({
                        type: 'help',
                        name: 'help-' + commandName,
                        text: true,
                    })
                } else {
                    existsText.text = true;
                }

                break;
            case 'slash':
                const existsSlash = helpEntries.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName);

                if(existsSlash == undefined) {
                    helpEntries.push({
                        type: 'help',
                        name: 'help-' + commandName,
                        slash: true,
                    })
                } else {
                    existsSlash.slash = true;
                }

                break;
        }
    });

    helpEntries.forEach(command => {
        const commandArguments = [] as { name: string, description: string, type: 'slash' | 'text' }[]; 
        const commandName = command.name.substring(command.name.indexOf("-") + 1);

        const slashCommand = data.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName && part.type == 'slash');
        const textCommand = data.find(part => part.name.substring(part.name.indexOf("-") + 1) == commandName && part.type == 'text');
        if(slashCommand && slashCommand.type != 'slash' || textCommand && textCommand.type != 'text') return;

        if(slashCommand == undefined && textCommand == undefined) return;     
        const description = command.description ? command.description : (textCommand ? textCommand.command().helpInformation().substring(textCommand.command().helpInformation().indexOf("\n\n") + 2, textCommand.command().helpInformation().indexOf("\n\n", textCommand.command().helpInformation().indexOf("\n\n") + 3)) : (slashCommand?.command.toJSON().description ?? "No description found."));

        if(textCommand && command.text) {
            const commandInstance = textCommand.command();
            const help = commandInstance.helpInformation();

            const argumentsIndex = help.indexOf('Arguments:');
            const optionsIndex = help.indexOf('Options:');
            const commandsIndex = help.indexOf('Commands:');

            if(argumentsIndex !== -1) {
                const argumentsSection = help.substring(argumentsIndex, optionsIndex !== -1 ? optionsIndex : commandsIndex !== -1 ? commandsIndex : undefined);
                const argumentLines = argumentsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                argumentLines.forEach(line => {
                    const parts = line.trim().split(/\s\s+/);
                    if(parts.length < 2) return;
                    const namePart = parts[0];
                    const description = parts.slice(1).join(' ');
                    
                    const usageLine = help.substring(help.indexOf('Usage:'), help.indexOf('\n'));
                    const isOptional = usageLine.includes(`[${namePart}`);
                    const isRequired = usageLine.includes(`<${namePart}`);
                    const type = isOptional ? "optional" : isRequired ? "required" : "argument";
                    
                    commandArguments.push({ name: (type == "optional" ? "[" : "<") + namePart + (type == "optional" ? "]" : ">"), description: description + ` ***(${type})***`, type: 'text' });
                });
            }

            if(optionsIndex !== -1) {
                const optionsSection = help.substring(optionsIndex, commandsIndex !== -1 ? commandsIndex : undefined);
                const optionLines = optionsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                optionLines.forEach(line => {
                    const parts = line.trim().split(/\s\s+/);
                    if(parts.length < 2 || parts[0].includes("help")) return;
                    commandArguments.push({ name: parts[0], description: parts.slice(1).join(' ') + (parts.slice(1).join(' ').includes("** **") ? ' ***(required)***' : ' ***(optional)***'), type: 'text' });
                });
            }

            if(commandsIndex !== -1) {
                const commandsSection = help.substring(commandsIndex);
                const commandLines = commandsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                commandLines.forEach(line => {
                    const parts = line.trim().split(/\s\s+/);
                    if(parts.length < 2) return;
                    const name = parts[0];
                    const description = parts.slice(1).join(' ');
                    commandArguments.push({ name, description: description + "** **", type: 'text' });
                });
            }

            commandInstance.commands.forEach(subcommand => {
                const subcommandHelp = subcommand.helpInformation();

                const subcommandArgumentsIndex = subcommandHelp.indexOf('Arguments:');
                const subcommandOptionsIndex = subcommandHelp.indexOf('Options:');

                const subcommandCommandArguments = [] as { name: string, description: string, type: 'slash' | 'text' }[];

                if(subcommandArgumentsIndex !== -1) {
                    const subcommandArgumentsSection = subcommandHelp.substring(subcommandArgumentsIndex, subcommandOptionsIndex !== -1 ? subcommandOptionsIndex : undefined);
                    const subcommandArgumentLines = subcommandArgumentsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                    subcommandArgumentLines.forEach(line => {
                        const parts = line.trim().split(/\s\s+/);
                        if(parts.length < 2) return;
                        const namePart = parts[0];
                        const description = parts.slice(1).join(' ');
                        
                        const usageLine = subcommandHelp.substring(subcommandHelp.indexOf('Usage:'), subcommandHelp.indexOf('\n'));
                        const isOptional = usageLine.includes(`[${namePart}`);
                        const isRequired = usageLine.includes(`<${namePart}`);
                        const type = isOptional ? "optional" : isRequired ? "required" : "argument";
                        
                        subcommandCommandArguments.push({ name: (type == "optional" ? "[" : "<") + namePart + (type == "optional" ? "]" : ">"), description: description + ` ***(${type})***`, type: 'text' });
                    });
                }

                if(subcommandOptionsIndex !== -1) {
                    const subcommandOptionsSection = subcommandHelp.substring(subcommandOptionsIndex);
                    const subcommandOptionLines = subcommandOptionsSection.split('\n').slice(1).filter(line => line.trim() !== '');

                    subcommandOptionLines.forEach(line => {
                        const parts = line.trim().split(/\s\s+/);
                        if(parts.length < 2 || parts[0].includes("help")) return;
                        subcommandCommandArguments.push({ name: parts[0], description: parts.slice(1).join(' ') + (parts.slice(1).join(' ').includes("** **") ? ' ***(required)***' : ' ***(optional)***'), type: 'text' });
                    });
                }

                const subcommandTextArguments = subcommandCommandArguments
                    .map(argument => (argument.name.indexOf(",") != -1 ? argument.name.substring(argument.name.indexOf(",") + 1) : argument.name).trim())
                    .join(" ");

                const subcommandName = subcommandHelp.substring(subcommandHelp.indexOf("mafiabot " + commandName) + (("mafiabot" + commandName).length + 1), subcommandHelp.indexOf("[options]") - 1).split("|")[0];
                const subcommandDescription = subcommandHelp.substring(subcommandHelp.indexOf("\n\n") + 2, subcommandHelp.indexOf("\n\n", subcommandHelp.indexOf("\n\n") + 3));

                client.help.set(command.name + "-" + subcommandName, { name: command.name + "-" + subcommandName, shorthand: "?" + commandName + " " + subcommandName, description: subcommandDescription, arguments: subcommandCommandArguments, text: "?" + commandName + " " + subcommandName + " " + subcommandTextArguments });
            });

            
            const textArguments = commandArguments
                .filter(arg => arg.type === 'text' && !arg.description.includes('** **'))
                .map(argument => (argument.name.indexOf(",") != -1 ? argument.name.substring(argument.name.indexOf(",") + 1) : argument.name).trim())
                .join(" ");
            command.text = `?${commandName} ${textArguments}`;
        }

        if(slashCommand && command.slash) {
            const slashCommandArguments = (slashCommand.command.toJSON().options?.map(option => {
                const isSubcommand = option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup;
                const description = option.description + (isSubcommand ? "" : (option.required ? " ***(required)***" : " ***(optional)***"));
                return { name: option.name, description, type: 'slash' as 'slash', format: option.type };
            }) ?? []);

            command.slash = "/" + commandName + " " + getFormat(slashCommand.command).join(" ");

            commandArguments.push( ...slashCommandArguments );

            if(slashCommand.command.toJSON().options?.some(o => o.type === ApplicationCommandOptionType.Subcommand || o.type == ApplicationCommandOptionType.SubcommandGroup)) slashCommand.command.options.forEach(subcommand => {
                if(!(subcommand instanceof SlashCommandSubcommandBuilder || subcommand instanceof SlashCommandSubcommandGroupBuilder)) return;
                    
                const slashSubcommandArguments = (subcommand.toJSON().options?.map(option => {
                    const isSubcommand = option.type === ApplicationCommandOptionType.SubcommandGroup;
                    const description = option.description + (option.required ? " ***(required)***" : " ***(optional)***");
                    return { name: option.name, description, type: 'slash' as 'slash', format: option.type };
                }) ?? []);

                const existing = client.help.get(command.name + "-" + subcommand.name);

                if(existing) {
                    existing.arguments.push(...slashSubcommandArguments);
                    existing.shorthand += " • /" + commandName + " " + subcommand.name;
                    existing.slash = "/" + commandName + " " + subcommand.name + " " + getFormat(subcommand).join(" ");
                } else {
                    client.help.set(command.name + "-" + subcommand.name, { name: command.name + "-" + subcommand.name, shorthand: "/" + commandName + " " + subcommand.name, description: subcommand.description, arguments: slashSubcommandArguments, slash: "/" + commandName + " " + subcommand.name + " " + getFormat(subcommand).join(" ") });
                }
            });  
        }

        client.help.set(command.name, { ...command, arguments: commandArguments, description: description, shorthand: (command.text ? "?" + commandName : "") + (command.slash && command.text ? " • " : "") + (command.slash ? "/" + commandName : ""), slash: command.slash == undefined ? undefined : command.slash.toString(), text: command.text == undefined ? undefined : command.text.toString() });
    });
}

function getFormat(command: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder) {
    const formatted = [] as string[];

    (command.toJSON().options ?? []).forEach(option => {
        switch(option.type) {
            case ApplicationCommandOptionType.String:
                if(option.choices) {
                    formatted.push(option.name + ":{" + option.choices.map(choice => choice.name).join("|") + "}");
                } else {
                    formatted.push(option.name + ":{" + option.name + "}");
                }

                break;
            case ApplicationCommandOptionType.Number:
            case ApplicationCommandOptionType.Integer:
                formatted.push(option.name + ":{number}");
                break;
            case ApplicationCommandOptionType.Boolean:
                formatted.push(option.name + ":{true|false}");
                break;
            case ApplicationCommandOptionType.Channel:
                formatted.push(option.name + ":{channel}");
                break;
            case ApplicationCommandOptionType.Role:
                formatted.push(option.name + ":{role}");
                break;
            case ApplicationCommandOptionType.User:
                formatted.push(option.name + ":{user}");
                break;
            case ApplicationCommandOptionType.Mentionable:
                formatted.push(option.name + ":{mention}");
                break;
            case ApplicationCommandOptionType.Attachment:
                formatted.push(option.name + ":{attachment}");
                break;    
        } 
    });

    return formatted;
}