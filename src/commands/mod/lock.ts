import { Command } from "commander";
import { ActionRowBuilder, APIActionRowComponent, APIButtonComponent, APISelectMenuComponent, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, ComponentType, EmbedBuilder, Interaction, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder } from "discord.js";
import { DateTime } from "luxon";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal } from '../../utils/global';
import { lockGame, unlockGame } from "../../utils/mafia/main";
import { getFuture, getGrace, setFuture, setGrace } from "../../utils/mafia/timing";
import { getSetup } from "../../utils/setup";
import { Subcommand, Subinteraction } from "../../utils/subcommands";

export const LockingSelect = {
    type: "select",
    name: "select-future",
    subcommand: true,

    command: z.object({
        name: z.literal("future"),
        type: z.boolean(),
    }),

    execute: handleLockingSelect
} satisfies Subinteraction;

export const UnlockButton = {
    type: 'button',
    name: 'button-unlock',
    subcommand: true,

    command: z.object({
        name: z.literal("unlock"),
        type: z.boolean(),
        value: z.string(),
        grace: z.boolean(),
    }),

    execute: handleUnlockButton
} satisfies Subinteraction;

export const LockCommand = {
    name: "lock",
    subcommand: true,
    
    slash: new SlashCommandSubcommandBuilder()
        .setName("lock")
        .setDescription("Locks the mafia game."),
    text: () => {
        return new Command()
            .name('lock')
            .description('Locks the game, use slash command to schedule.')
            .argument('<now>', 'now', fromZod(z.literal('now')))
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        if(!global.started) throw new Error("Game not started.");
        if(global.locked) throw new Error("Game is already locked.");

        if(interaction.type == 'text') {
            await lockGame();

            await interaction.message.react('✅');

            return;
        }

        await handleLocking(interaction, true);
    }
} satisfies Subcommand;

export const UnlockCommand = {
    name: "unlock",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("unlock")
        .setDescription("Unlocks the mafia game."),
    text: () => {
        return new Command()
            .name('unlock')
            .description('Unlocks the game, and asks if you want to advance day. Use slash command to schedule.')
            .argument('<now>', 'now', fromZod(z.literal('now')))
            .argument('<type>', 'to advance or stay day (advance, stay)', fromZod(z.union([z.literal('stay'), z.literal('advance')])));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        if(!global.started) throw new Error("Game not started.");
        if(global.day == 0) throw new Error("Setup alignments first.");
        if(!global.locked) throw new Error("Game is already unlocked.");

        if(interaction.type == 'text') {
            await unlockGame((interaction.program.processedArgs[1] as string) == 'stay' ? false : true);

            await interaction.message.react('✅');

            return;
        }

        await handleLocking(interaction, false);
    }
} satisfies Subcommand;

export const GraceCommand = {
    name: "grace",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("grace")
        .setDescription("Sets game on grace.")
        .addBooleanOption(option =>
            option
                .setName("grace")
                .setDescription("Whether or not to set game on grace.")
                .setRequired(true)),
    text: () => {
        return new Command()
            .name('grace')
            .description('Sets the grace of the game on or off. Grace is when players cannot vote.')
            .argument("<type>", "on, off", fromZod(z.union([z.literal('on'), z.literal('off')])));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        const global = await getGlobal();

        if(!global.started) throw new Error("Game not started.");
        
        const db = firebaseAdmin.getFirestore();

        let grace = interaction.type == 'text' ? interaction.program.processedArgs[0] == 'on' : interaction.options.getBoolean('grace') ?? false;

        if(interaction.type == 'text') {
            await db.collection('settings').doc('game').update({
                grace: grace
            });

            await interaction.message.react('✅');

            return;
        }

        const timing = await getGrace();

        const embed = new EmbedBuilder()
            .setTitle('Choose a time to set grace to ' + (grace ? "on" : "off") + ".")
            .setColor(Colors.Orange)
            .setDescription("Options are in PST." + (timing ? "\n\nThis will overwrite current grace set to " + (timing.type ? "on" : "on") + " at <t:" + Math.round(timing.when.valueOf() / 1000) + ":T>, <t:" + Math.round(timing.when.valueOf() / 1000) + ":d> if scheduling (selecting now will not)." : " "))

        let date = DateTime.now().setZone('US/Pacific').startOf("hour");

        //dnt.format(date, "h:mm A, M/DD/YY")

        const select = new StringSelectMenuBuilder()
            .setCustomId(JSON.stringify({ name: "grace", grace: grace }))
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
                    .setLabel(date.toFormat("h a, L/d/yy"))
                    .setDescription("Set grace to " + (grace ? "on" : "off") + " " + date.toFormat("h a, L/d/yy") + ".")
                    .setValue(date.valueOf().toString()),
            )
        }

        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(select)

        const minuteRow = getMinuteRow();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
            components: [row, minuteRow]
        })
    }
} satisfies Subcommand;

export const GraceSelect = {
    type: "select",
    name: "select-grace",
    subcommand: true,

    command: z.object({
        name: z.literal("grace"),
        grace: z.boolean(),
    }),

    execute: handleLockingGrace
} satisfies Subinteraction;

export const GraceButton = {
    type: "button",
    name: "button-set-grace",
    subcommand: true,

    command: z.object({
        name: z.literal("set-grace"),
        grace: z.boolean(),
        value: z.string(),
        type: z.boolean(),
    }),

    execute: handleGraceButton
} satisfies Subinteraction;
 
export const Minute = {
    type: "select",
    name: "select-minute",
    subcommand: true,

    command: z.object({
        name: z.literal("minute"),
    }),

    execute: async (interaction: StringSelectMenuInteraction) => {
        const value = interaction.values[0];

        const rowComponents = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent | APISelectMenuComponent>[]

        for(let i = 0; i < rowComponents.length; i++) {
            for(let j = 0; j < rowComponents[i].components.length; j++) {
                const select = rowComponents[i].components[j];

                if(!('style' in select && !('custom_id' in select)) && select.custom_id == interaction.customId && select.type == ComponentType.StringSelect) {
                    select.options.forEach(option => {
                        if(option.default) {
                            option.default = false;
                        } else if(option.value == value) {
                            option.default = true;
                        }
                    });
                }
            }
        }

        await interaction.update({ components: rowComponents });
    }
} satisfies Subinteraction;

async function handleLocking(interaction: ChatInputCommandInteraction, type: boolean) {
    const timing = await getFuture();

    const embed = new EmbedBuilder()
        .setTitle('Choose a time to ' + (type ? "lock" : "unlock") + " channel.")
        .setColor(Colors.Orange)
        .setDescription("Options are in PT." + (timing ? "\n\nThis will overwrite current " + (timing.type ? "lock" : "unlock") + " at <t:" + Math.round(timing.when.valueOf() / 1000) + ":T>, <t:" + Math.round(timing.when.valueOf() / 1000) + ":d> if scheduling (selecting now will not)." : " "))
        .setFooter({ text: "Set the minute before setting the hour." });

    let date = DateTime.now().setZone('US/Pacific').startOf("hour").minus({ hours: 1 });

    //dnt.format(date, "h:mm A, M/DD/YY")

    const select = new StringSelectMenuBuilder()
        .setCustomId(JSON.stringify({ name: "future", type: type }))
        .setPlaceholder('When to ' + (type ? "lock" : "unlock") + " channel?")
        .setOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Now")
                .setDescription((type ? "Lock" : "Unlock") + " the channel now.")
                .setValue("now"),
        );

    for(let i = 0; i < 15; i++) {
        date = date.plus({ hours: 1 });

        if(date.hour > 0 && date.hour < 10) {
            date = date.set({ hour: 10 });
        }

        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(date.toFormat("h a, L/d/yy"))
                .setDescription((type ? "Lock" : "Unlock") + " the channel " + date.toFormat("h a, L/d/yy") + ".")
                .setValue(date.valueOf().toString()),
        );
    }

    select.addOptions([
        new StringSelectMenuOptionBuilder()
            .setLabel('Add Day')
            .setDescription('Move forward all time options a day later.')
            .setValue('forward'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Subtract Day')
            .setDescription('Move backward all time options a day before.')
            .setValue('backward')
    ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(select)

    const minuteRow = getMinuteRow();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true,
        components: [row, minuteRow]
    })
}

async function handleLockingSelect(interaction: StringSelectMenuInteraction) {
    const id = JSON.parse(interaction.customId) as { name: "future", type: boolean };

    const value = interaction.values[0];

    if(value == "forward" || value == "backward") {
        const rows = (interaction.message.toJSON() as any).components as APIActionRowComponent<APISelectMenuComponent>[];

        const select = rows.find(row => row.components.find(component => component.custom_id.includes("future")))?.components[0];

        if(select == undefined || select.type != ComponentType.StringSelect) return;

        select.options.forEach(option => {
            const optionValue = z.coerce.number().safeParse(option.value);

            if(optionValue.success == false) return;

            let date = DateTime.fromMillis(optionValue.data).setZone('US/Pacific');

            if(value == "forward") {
                date = date.plus({ day: 1 });
            } else {
                date = date.minus({ day: 1 });
            }

            option.label = date.toFormat("h a, L/d/yy");
            option.description = (id.type ? "Lock" : "Unlock") + " the channel " + date.toFormat("h a, L/d/yy") + ".";
            option.value = date.valueOf().toString();            
        });

        await interaction.update({ components: rows });

        return;
    }

    const minute = getMinute(interaction);
    const minuteOffset = minute * 1000 * 60;

    const date = value == "now" ? "now" : new Date(parseInt((value ?? new Date().valueOf())) + minuteOffset);

    const embed = new EmbedBuilder()
            .setTitle("Should grace be set to off/on on " + (id.type ? "lock" : "unlock") + ".")
            .setDescription(date == "now" ? "Channel will be unlocked immediently." : "Channel will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.")
            .setFooter({ text: "When grace is on, people are not allowed to vote." })
            .setColor(Colors.Orange)

    const row = new ActionRowBuilder<ButtonBuilder>()
        .setComponents([
            new ButtonBuilder()
                .setLabel("On")
                .setStyle(ButtonStyle.Success)
                .setCustomId(JSON.stringify({ name: "set-grace", value: date.valueOf().toString(), type: id.type, grace: true })),
            new ButtonBuilder()
                .setLabel("Off")
                .setStyle(ButtonStyle.Danger)
                .setCustomId(JSON.stringify({ name: "set-grace", value: date.valueOf().toString(), type: id.type, grace: false }))
        ])

    await interaction.update({
        embeds: [embed],
        components: [row],
    })
}

async function handleGraceButton(interaction: ButtonInteraction) {
    const setup = await getSetup();
    const global = await getGlobal();
    const db = firebaseAdmin.getFirestore();

    const id = JSON.parse(interaction.customId) as { name: "set-grace", grace: boolean, type: boolean, value: string, };

    const date = id.value == "now" ? "now" : new Date(parseInt(id.value ?? new Date().valueOf()));

    if(id.type == false) {
        const embed = new EmbedBuilder()
            .setTitle("Would like to also advance day once channel unlocks?")
            .setDescription(date == "now" ? "Channel will be unlocked immediently." : "Channel will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.")
            .setColor(Colors.Orange)

        const row = new ActionRowBuilder<ButtonBuilder>()
            .setComponents([
                new ButtonBuilder()
                    .setLabel("Advance to Day " + (global.day + 1))
                    .setStyle(ButtonStyle.Success)
                    .setCustomId(JSON.stringify({ name: "unlock", value: id.value, type: true, grace: id.grace })),
                new ButtonBuilder()
                    .setLabel("Stay on Day " + (global.day))
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId(JSON.stringify({ name: "unlock", value: id.value, type: false, grace: id.grace }))
            ])

        await interaction.update({
            embeds: [embed],
            components: [row],
        })
    } else {
        if(date == "now") {
            await lockGame();

            await db.collection('settings').doc('game').update({
                grace: id.grace
            });

            await interaction.update({
                content: "Channel locked.",
                components: [],
                embeds: [],
            });
        } else {
            await setFuture(date, false, true, id.grace);

            await interaction.update({
                content: "Channel will lock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
                components: [],
                embeds: [],
            });

            await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game will lock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
        }
    }
}

async function handleUnlockButton(interaction: ButtonInteraction) {
    const setup = await getSetup();
    const db = firebaseAdmin.getFirestore();

    const id = JSON.parse(interaction.customId) as { name: "unlock", value: string, type: boolean, grace: boolean };

    const date = id.value == "now" ? "now" : new Date(parseInt(id.value ?? new Date().valueOf()));

    if(date == "now") {
        await unlockGame(id.type);

        await db.collection('settings').doc('game').update({
            grace: id.grace
        });

        await interaction.update({
            components: [],
            embeds: [],
            content: "Channel unlocked.",
        });
    } else {
        await setFuture(date, id.type, false, id.grace);

        await interaction.update({
            content: "Channel will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
            components: [],
            embeds: [],
        });

        await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Game will unlock at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
    }
}

async function handleLockingGrace(interaction: StringSelectMenuInteraction) {
    const setup = await getSetup();
    const db = firebaseAdmin.getFirestore();

    const id = JSON.parse(interaction.customId) as { name: "grace", grace: boolean };

    const value = interaction.values[0];

    const minute = getMinute(interaction);
    const minuteOffset = minute * 1000 * 60;

    const date = value == "now" ? "now" : new Date(parseInt((value ?? new Date().valueOf())) + minuteOffset);

    if(date == "now") {
        await db.collection('settings').doc('game').update({
            grace: id.grace
        });

        await interaction.update({
            content: "Grace set to " + (id.grace ? "on" : "off") + ".",
            components: [],
            embeds: [],
        });
    } else {
        await setGrace(id.grace, date);

        await interaction.update({
            content: "Grace will be set to " + (id.grace ? "on" : "off") + " at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>.",
            components: [],
            embeds: [],
        });

        await setup.primary.chat.send("<@&" + setup.primary.alive.id + "> Grace will be set to " + (id.grace ? "on" : "off") + " at <t:" + Math.round(date.valueOf() / 1000) + ":T>, <t:" + Math.round(date.valueOf() / 1000) + ":d>!")
    }
}


function getMinute(interaction: Interaction) {
    if(!('message' in interaction) || interaction.message == null) return 0;

    const rowComponents = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent | APISelectMenuComponent>[];

    for(let i = 0; i < rowComponents.length; i++) {
        for(let j = 0; j < rowComponents[i].components.length; j++) {
            const select = rowComponents[i].components[j];

            if('custom_id' in select) {
                console.log(JSON.parse(select.custom_id).name, select.type == ComponentType.StringSelect);
            }

            if('custom_id' in select && JSON.parse(select.custom_id).name == "minute" && select.type == ComponentType.StringSelect) {
                for(let i = 0; i < select.options.length; i++) {
                    if(select.options[i].default) {
                        return parseInt(select.options[i].value);
                    }
                }
            }
        }
    }

    return 0;
}

function getMinuteRow() {
    const minuteSelect = new StringSelectMenuBuilder()
            .setCustomId(JSON.stringify({ name: "minute" }))
            .setPlaceholder("Change the minute of when to set grace to.");

    for(let i = 0; i < 12; i++) {
        minuteSelect.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("*:" + ( i < 2 ? "0" + "" + (i * 5) : i * 5))
                .setValue((i * 5).toString())
                .setDefault(i == 0),
        )
    }

    const minuteRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(minuteSelect);

    return minuteRow;
}
