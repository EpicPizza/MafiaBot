import { ActionRowBuilder, APIActionRowComponent, APIButtonComponent, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { getGlobal, lockGame, unlockGame } from "../../utils/main";
import { DateTime } from "luxon";
import { getFuture, getGrace, setFuture, setGrace } from "../../utils/timing";
import { getSetup } from "../../utils/setup";
import { z } from "zod";
import { firebaseAdmin } from "../../firebase";

export const LockCommand = {
    name: "lock",
    description: "?mod lock",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("lock")
            .setDescription("Locks the mafia game."),
        text: {

        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        if(!global.started) throw new Error("Game not started.");
        if(global.locked) throw new Error("Game is already locked.");

        await handleLocking(interaction, true);
    }
}

export const GraceCommand = {
    name: "grace",
    description: "?mod grace",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("grace")
            .setDescription("Sets game on grace.")
            .addBooleanOption(option =>
                option
                    .setName("grace")
                    .setDescription("Whether or not to set game on grace.")
                    .setRequired(true)),
        text: {
            required: [ z.string() ],
            optional: []
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        if(!global.started) throw new Error("Game not started.");
        
        const db = firebaseAdmin.getFirestore();

        let grace = interaction.type == 'text' ? interaction.arguments[1] == 'on' : interaction.options.getBoolean('grace');

        const timing = await getGrace();

        const embed = new EmbedBuilder()
            .setTitle('Choose a time to set grace to ' + (grace ? "on" : "off") + ".")
            .setColor(Colors.Orange)
            .setDescription("Options are in PST." + (timing ? "\n\nThis will overwrite current grace set to " + (timing.type ? "on" : "on") + " at <t:" + Math.round(timing.when.valueOf() / 1000) + ":T>, <t:" + Math.round(timing.when.valueOf() / 1000) + ":d>." : " "))

        let date = DateTime.now().setZone('US/Pacific').startOf("hour");

        //dnt.format(date, "h:mm A, M/DD/YY")

        const select = new StringSelectMenuBuilder()
            .setCustomId(JSON.stringify({ name: "grace", grace: grace, through: interaction.type == 'text' ? 'text' : 'slash' }))
            .setPlaceholder('When to set grace to ' + (grace ? "on" : "off") + " channel?")
            .setOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel("Now")
                    .setDescription("Set grace to " + (grace ? "on" : "off") + " now.")
                    .setValue("now"),
            )

        for(let i = 0; i < 24; i++) {
            date = date.plus({ hours: 1 });

            if(date.hour > 0 && date.hour < 10) {
                date = date.set({ hour: 10 });
            }

            select.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(date.toFormat("h:mm a, L/d/yy"))
                    .setDescription("Set grace to " + (grace ? "on" : "off") + " " + date.toFormat("h:mm a, L/d/yy") + ".")
                    .setValue(date.valueOf().toString()),
            )
        }

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(select)

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
            components: [row]
        })
    }
}

export const GraceSelect = {
    type: "select",
    name: "select-grace",
    command: z.object({
        name: z.literal("grace"),
        grace: z.boolean(),
        through: z.literal("text").or(z.literal("slash"))
    }),
    execute: handleLockingGrace
}

export const ChangeGraceButton = {
    type: 'button',
    name: 'button-change-grace',
    command: z.object({
        name: z.literal('change-grace'),
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]

        for(let i = 0; i < components.length; i++) {
            for(let j = 0; j < components[i].components.length; j++) {
                const button = components[i].components[j];

                if(button.style != ButtonStyle.Link && button.custom_id == interaction.customId) {
                    if(button.style == ButtonStyle.Success) {
                        button.style = ButtonStyle.Danger;
                        button.label = "Grace Off";
                    } else if(button.style == ButtonStyle.Danger) {
                        button.style = ButtonStyle.Success;
                        button.label = "Grace On";
                    }
                }
            }
        }

        await interaction.update({ components: components });
    }
}

export const UnlockCommand = {
    name: "unlock",
    description: "?mod unlock",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("unlock")
            .setDescription("Unlocks the mafia game."),
        text: {

        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        if(!global.started) throw new Error("Game not started.");
        if(global.day == 0) throw new Error("Setup allignments first.");
        if(!global.locked) throw new Error("Game is already unlocked.");

        await handleLocking(interaction, false);
    }
}

export const LockingSelect = {
    type: "select",
    name: "select-future",
    command: z.object({
        name: z.literal("future"),
        type: z.boolean(),
        through: z.literal("text").or(z.literal("slash"))
    }),
    execute: handleLockingSelect
}

export const UnlockButton = {
    type: 'button',
    name: 'button-unlock',
    command: z.object({
        name: z.literal("unlock"),
        type: z.boolean(),
        value: z.string(),
        through: z.literal("text").or(z.literal("slash")),
        grace: z.boolean(),
    }),
    execute: handleUnlockButton
}

async function handleUnlockButton(interaction: ButtonInteraction) {
    const setup = await getSetup();
    const db = firebaseAdmin.getFirestore();

    const id = JSON.parse(interaction.customId) as { name: "unlock", value: string, type: boolean, through: string, grace: boolean };

    const date = id.value == "now" ? "now" : new Date(parseInt(id.value ?? new Date().valueOf()));

    if(date == "now") {
        await unlockGame(id.type);

        await db.collection('settings').doc('game').update({
            grace: id.grace
        });

        if(id.through == 'slash') {
            await interaction.update({
                components: [],
                embeds: [],
                content: "Channel unlocked.",
            })
        } else {
            (await interaction.message.fetchReference()).react('✅');

            await interaction.message.delete();
        } 
    } else {
        await setFuture(date, id.type, false, id.grace);

        if(id.through == 'slash') {
            await interaction.update({
                content: "Channel will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
                components: [],
                embeds: [],
            });
        } else {
            (await interaction.message.fetchReference()).react('✅');

            await interaction.message.delete();
        }

        await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
    }
}

async function handleLocking(interaction: ChatInputCommandInteraction | Command, type: boolean) {
    const timing = await getFuture();

    const embed = new EmbedBuilder()
        .setTitle('Choose a time to ' + (type ? "lock" : "unlock") + " channel.")
        .setColor(Colors.Orange)
        .setDescription("Options are in PST." + (timing ? "\n\nThis will overwrite current " + (timing.type ? "lock" : "unlock") + " at <t:" + Math.round(timing.when.valueOf() / 1000) + ":T>, <t:" + Math.round(timing.when.valueOf() / 1000) + ":d>." : " "))
        .setFooter({ text: "Toggle grace button to change if grace will be set on or off once game is" + (type ? " locked." : " unlocked.") });

    let date = DateTime.now().setZone('US/Pacific').startOf("hour");

    //dnt.format(date, "h:mm A, M/DD/YY")

    const select = new StringSelectMenuBuilder()
        .setCustomId(JSON.stringify({ name: "future", type: type, through: interaction.type == 'text' ? 'text' : 'slash' }))
        .setPlaceholder('When to ' + (type ? "lock" : "unlock") + " channel?")
        .setOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Now")
                .setDescription((type ? "Lock" : "Unlock") + " the channel now.")
                .setValue("now"),
        )

    for(let i = 0; i < 24; i++) {
        date = date.plus({ hours: 1 });

        if(date.hour > 0 && date.hour < 10) {
            date = date.set({ hour: 10 });
        }

        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(date.toFormat("h:mm a, L/d/yy"))
                .setDescription((type ? "Lock" : "Unlock") + " the channel " + date.toFormat("h:mm a, L/d/yy") + ".")
                .setValue(date.valueOf().toString()),
        )
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(select)

    const grace = new ActionRowBuilder<ButtonBuilder>()
        .addComponents([
            new ButtonBuilder()
                .setLabel("Grace Off")
                .setCustomId(JSON.stringify({ name: "change-grace" }))
                .setStyle(ButtonStyle.Danger)
        ])

    await interaction.reply({
        embeds: [embed],
        ephemeral: true,
        components: [row, grace]
    })
}

async function handleLockingSelect(interaction: StringSelectMenuInteraction) {
    const setup = await getSetup();
    const db = firebaseAdmin.getFirestore();

    const id = JSON.parse(interaction.customId) as { name: "future", type: boolean, through: string };

    const value = interaction.values[0];

    const date = value == "now" ? "now" : new Date(parseInt(value ?? new Date().valueOf()));

    const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[];

    let grace = false;

    for(let i = 0; i < components.length; i++) {
        for(let j = 0; j < components[i].components.length; j++) {
            const button = components[i].components[j];

            if(button.style != ButtonStyle.Link) {

                grace = !(button.style == ButtonStyle.Danger);
            }
        }
    }

    if(id.type == false) {
        const embed = new EmbedBuilder()
            .setTitle("Would like to also advance day once channel unlocks?")
            .setDescription(date == "now" ? "Channel will be unlocked immediently." : "Channel will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.")
            .setColor(Colors.Orange)
            .setFooter({ text: "Game begins at day 1, do not advance if this is the first unlock that starts the game." })

        const row = new ActionRowBuilder<ButtonBuilder>()
            .setComponents([
                new ButtonBuilder()
                    .setLabel("Yes")
                    .setStyle(ButtonStyle.Success)
                    .setCustomId(JSON.stringify({ name: "unlock", value: date.valueOf().toString(), type: true, through: id.through, grace: grace })),
                new ButtonBuilder()
                    .setLabel("No")
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId(JSON.stringify({ name: "unlock", value: date.valueOf().toString(), type: false, through: id.through, grace: grace }))
            ])

        await interaction.update({
            embeds: [embed],
            components: [row],
        })
    } else {
        if(date == "now") {
            await lockGame();

            await db.collection('settings').doc('game').update({
                grace: grace
            });

            if(id.through == 'slash') {
                await interaction.update({
                    content: "Channel locked.",
                    components: [],
                    embeds: [],
                });
            } else {
                (await interaction.message.fetchReference()).react('✅');

                await interaction.message.delete();
            }
        } else {
            await setFuture(date, false, true, grace);

            if(id.through == 'slash') {
                await interaction.update({
                    content: "Channel will lock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
                    components: [],
                    embeds: [],
                });
            } else {
                (await interaction.message.fetchReference()).react('✅');

                await interaction.message.delete();
            }

            await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game will lock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
        }
    }
}

async function handleLockingGrace(interaction: StringSelectMenuInteraction) {
    const setup = await getSetup();
    const db = firebaseAdmin.getFirestore();

    const id = JSON.parse(interaction.customId) as { name: "grace", grace: boolean, through: string };

    const value = interaction.values[0];

    const date = value == "now" ? "now" : new Date(parseInt(value ?? new Date().valueOf()));

    console.log(date == "now", id.grace);

    if(date == "now") {
        await db.collection('settings').doc('game').update({
            grace: id.grace
        });

        if(id.through == 'slash') {
            await interaction.update({
                content: "Grace set to " + (id.grace ? "on" : "off") + ".",
                components: [],
                embeds: [],
            });
        } else {
            (await interaction.message.fetchReference()).react('✅');

            await interaction.message.delete();
        }
    } else {
        await setGrace(id.grace, date);

        if(id.through == 'slash') {
            await interaction.update({
                content: "Grace will be set to " + (id.grace ? "on" : "off") + " at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
                components: [],
                embeds: [],
            });
        } else {
            (await interaction.message.fetchReference()).react('✅');

            await interaction.message.delete();
        }

        await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Grace will be set to " + (id.grace ? "on" : "off") + " at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
    }
}