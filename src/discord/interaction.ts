import { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, ClientEvents, ContextMenuCommandInteraction, Events, InteractionType, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";
import client from "./client";
import { z } from "zod";
import { Event } from ".";
import { getAuthority } from "../utils/instance";
import { SafeError } from "../utils/error";

const CustomId = z.object({
    name: z.string(),
});

export async function interactionCreateHandler(...[interaction]: ClientEvents[Events.InteractionCreate]) {
    const instance = await getAuthority(interaction.guildId ?? "---", false);

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

        const command = client.commands.get(`button-${name}`);

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
            const event = interaction as unknown as Event<ButtonInteraction>;

            event.name = name;
            event.inInstance = () => { if(instance == undefined) throw new Error("Server not setup!"); };
            event.instance = instance;

            await command.execute(event);
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

        const command = client.commands.get(`modal-${name}`);

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
            const event = interaction as unknown as Event<ModalSubmitInteraction>;

            event.name = name;
            event.inInstance = () => { if(instance == undefined) throw new Error("Server not setup!"); };
            event.instance = instance;

            await command.execute(event);
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

        const command = client.commands.get(`select-${name}`);

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
            const event = interaction as unknown as Event<ButtonInteraction>;

            event.name = name;
            event.inInstance = () => { if(instance == undefined) throw new Error("Server not setup!"); };
            event.instance = instance;

            await command.execute(event);
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
        const command = client.commands.get(`slash-${interaction.commandName}`);

        if (command == undefined || command.type != 'command') {
            await interaction.reply({ content: "Slash command not found.", ephemeral: true });

            return;
        }

        try {
            const event = interaction as unknown as Event<ChatInputCommandInteraction>;

            event.name = interaction.commandName;
            event.inInstance = () => { if(instance == undefined) throw new Error("Server not setup!"); };
            event.instance = instance;
            
            await command.execute(event);
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
        const command = client.commands.get(`context-${interaction.commandName}`);

        if (command == undefined || command.type != 'command') {
            await interaction.reply({ content: "Context menu command not found.", ephemeral: true });

            return;
        }

        try {
            const event = interaction as unknown as Event<ContextMenuCommandInteraction>;

            event.name = interaction.commandName;
            event.inInstance = () => { if(instance == undefined) throw new Error("Server not setup!"); };
            event.instance = instance;
            
            await command.execute(event);
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
        const command = client.commands.get(`slash-${interaction.commandName}`);


        if (command == undefined || command.type != 'command') {
            return;
        }

        try {

            const event = interaction as unknown as Event<any>;

            event.name = interaction.commandName;
            event.inInstance = () => { if(instance == undefined) throw new Error("Server not setup!"); };
            event.instance = instance;

            await command.execute(event);
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