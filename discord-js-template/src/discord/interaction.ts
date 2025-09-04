import { ClientEvents, Events } from "discord.js";
import client from "./client";
import { z } from "zod";

const CustomId = z.object({
    name: z.string(),
});

export async function interactionCreateHandler(...[interaction]: ClientEvents[Events.InteractionCreate]) {
    if (interaction.isButton()) {
        let name: string;

        try {
            const command = CustomId.parse(JSON.parse(interaction.customId));

            name = command.name;
        } catch (e) {
            console.log(e);

            await interaction.reply({ content: "An error occurred while processing button command.", ephemeral: true })

            return;
        }

        const command = client.commands.get(name);

        if (command == undefined || command.type != 'customId') {
            await interaction.reply({ content: "Button command not found.", ephemeral: true });

            return;
        }

        try {
            command.zod.parse(JSON.parse(interaction.customId));
        } catch (e) {
            console.log(e);

            interaction.reply({ content: `An error occurred while processing button command, ${name}.`, ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch (e: any) {
            try {
                console.log(e);

                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch (e) { } //trying to pickup commands from any point is kinda weird, so i put try catch just in case
        }
    } else if (interaction.isModalSubmit()) {
        let name: string;

        try {
            const command = CustomId.parse(JSON.parse(interaction.customId));

            name = command.name;
        } catch (e) {
            console.log(e);

            await interaction.reply({ content: "An error occurred while processing modal submit.", ephemeral: true })

            return;
        }

        const command = client.commands.get(name);

        if (command == undefined || command.type != 'customId') {
            await interaction.reply({ content: "Modal handler not found.", ephemeral: true });

            return;
        }

        try {
            command.zod.parse(JSON.parse(interaction.customId));
        } catch (e) {
            console.log(e);

            interaction.reply({ content: `An error occurred while processing modal submit, ${name}.`, ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch (e: any) {
            try {
                console.log(e);

                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch (e) { }
        }
    } else if (interaction.isStringSelectMenu()) {
        let name: string;

        try {
            const command = CustomId.parse(JSON.parse(interaction.customId));

            name = command.name;
        } catch (e) {
            console.log(e);

            await interaction.reply({ content: "An error occurred while processing select menu submit.", ephemeral: true })

            return;
        }

        const command = client.commands.get(name);

        if (command == undefined || command.type != 'customId') {
            await interaction.reply({ content: "Select menu handler not found.", ephemeral: true });

            return;
        }

        try {
            command.zod.parse(JSON.parse(interaction.customId));
        } catch (e) {
            console.log(e);

            interaction.reply({ content: `An error occurred while processing select menu submit, ${name}.`, ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch (e: any) {
            try {
                console.log(e);

                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch (e) { }
        }
    } else if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (command == undefined || command.type != 'command') {
            await interaction.reply({ content: "Slash command not found.", ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch (e: any) {
            try {
                console.log(e);

                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch (e) { }
        }
    } else if (interaction.isContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (command == undefined || command.type != 'command') {
            await interaction.reply({ content: "Context menu command not found.", ephemeral: true });

            return;
        }

        try {
            await command.execute(interaction);
        } catch (e: any) {
            try {
                console.log(e);

                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(e.message as string)
                } else {
                    await interaction.reply({ content: e.message as string, ephemeral: true });
                }
            } catch (e) { }
        }
    } else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);


        if (command == undefined || command.type != 'command') {
            return;
        }

        try {
            await command.execute(interaction);
        } catch (e: any) {
            try {
                console.log(e);
            } catch (e) { }
        }
    } else {
        if (interaction.isRepliable()) {
            await interaction.reply({ content: "Command not found.", ephemeral: true })
        }
    }
}
