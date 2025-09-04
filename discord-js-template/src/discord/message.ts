import { ClientEvents, Colors, EmbedBuilder, Events, Message, MessageReplyOptions } from "discord.js";
import stringArgv from "string-argv";
import client from "./client";
import type { TextCommand, ReactionCommand } from ".";
import { Command } from "commander";

export async function messageCreateHandler(...[message]: ClientEvents[Events.MessageCreate]) {
    try {
        if (!message.content.startsWith("?") || message.author.bot) {
            return;
        }

        const commands = Array.from(client.commands.values()).filter(command => command.type == "text");
        let program: Command = new Command().name('mafiabot');

        commands.forEach(text => {
            const command = text.command();
            command.exitOverride();
            program.addCommand(command);
        });

        program.exitOverride();
        const values = stringArgv(message.content.slice(1));

        try {
            await program.parseAsync(values, { from: 'user' });
        } catch (e: any) {
            if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version' || e.code === 'commander.help') {
                // Help or version is displayed.

                let helpMessage: string = "not found";
                let name: string = "unknown";

                const command = program.commands.find(c => c.name() === program.args[0] || c.aliases().includes(program.args[0]));

                if (program.args[0] == "help") {
                    helpMessage = program.helpInformation();
                    name = "help";
                } else if (program.args.length > 1 && command) {
                    const subcommand = command.commands.find(c => c.name() === program.args[1] || c.aliases().includes(program.args[1]));

                    helpMessage = subcommand?.helpInformation() ?? command.helpInformation();
                    name = subcommand?.name() ?? command.name();
                } else if(command) {
                    helpMessage = command.helpInformation();
                    name = command.name();
                }

                await message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`Help for ?${name}`)
                            .setDescription('```' + helpMessage + '```')
                            .setColor(Colors.Yellow)
                    ]
                });

                return;
            }

            // For other commander errors, re-throw.
            throw e;
        }

        const parsedCommand = program.commands.find(c => c.name() === program.args[0] || c.aliases().includes(program.args[0]));
        if(parsedCommand == undefined) throw new Error("Command not found!");
        const command = client.commands.get(parsedCommand.name());
        if(command == undefined) throw new Error("Command not found!");

        try {
            await command.execute({
                name: parsedCommand.name(),
                program: parsedCommand,
                message: message,
                type: 'text',
                reply: (options: MessageReplyOptions) => { return message.reply(options); }, //for consistency with interactions
                user: message.author,
            } satisfies TextCommand);
        } catch (e: any) {
            await message.reply({ content: e.message });
        }
    } catch (e: any) {
        if (message.content.startsWith("?") && message.content.length > 1) {
            let errorMessage = e.message as string;
            if (errorMessage.includes("\n")) errorMessage = errorMessage.slice(0, errorMessage.indexOf("\n")) + " ... trimmed";

            message.reply(errorMessage);
        }

        console.log(e);
    }
}

export async function messageReactionAddHandler(...[reaction, user]: ClientEvents[Events.MessageReactionAdd]) {
    try {
        if (reaction.partial) {
            reaction = await reaction.fetch();
        }

        if (user.bot == true) return;

        const command = client.commands.get(`reaction-${reaction.emoji.toString()}`);

        if (command == undefined || command.type != 'reaction') return;

        reaction.message = await reaction.message.fetch(true);
        user = await user.fetch(true);

        try {
            await command.execute({
                name: command.name,
                message: reaction.message,
                type: 'reaction',
                reply: (options: MessageReplyOptions) => { return reaction.message.reply(options); },
                author: reaction.message.author,
                user: user,
                reaction: reaction,
            } satisfies ReactionCommand);
        } catch (e: any) {
            try {
                const dm = await client.users.cache.get(user.id)?.createDM();

                if (dm != undefined) {
                    await dm.send({ content: e.message as string })
                }
            } catch (e) {
                console.log(e);
            }
        }
    } catch (e) {
        console.log(e);
    }
}
