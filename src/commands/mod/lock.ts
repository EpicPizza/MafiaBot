import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { getGlobal, lockGame, unlockGame } from "../../utils/main";
import { DateTime } from "luxon";
import { getFuture, setFuture } from "../../utils/timing";
import { getSetup } from "../../utils/setup";
import { z } from "zod";

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
        through: z.literal("text").or(z.literal("slash"))
    }),
    execute: handleUnlockButton
}

async function handleUnlockButton(interaction: ButtonInteraction) {
    const setup = await getSetup();

    const id = JSON.parse(interaction.customId) as { name: "unlock", value: string, type: boolean, through: string };

    const date = id.value == "now" ? "now" : new Date(parseInt(id.value ?? new Date().valueOf()));

    if(date == "now") {
        await unlockGame(id.type);

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
        await setFuture(date, id.type, false);

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

        if(date.hour > 0 && date.hour < 12) {
            date = date.set({ hour: 12 });
        }

        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(date.toFormat("h:mm a, L/d/yy"))
                .setDescription((type ? "Lock" : "Unlock") + " the channel " + date.toFormat("h:mm a, L/d/yy") + ".")
                .setValue(date.valueOf().toString())
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

async function handleLockingSelect(interaction: StringSelectMenuInteraction) {
    const setup = await getSetup();

    const id = JSON.parse(interaction.customId) as { name: "future", type: boolean, through: string };

    const value = interaction.values[0];

    const date = value == "now" ? "now" : new Date(parseInt(value ?? new Date().valueOf()));

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
                    .setCustomId(JSON.stringify({ name: "unlock", value: date.valueOf().toString(), type: true, through: id.through })),
                new ButtonBuilder()
                    .setLabel("No")
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId(JSON.stringify({ name: "unlock", value: date.valueOf().toString(), type: false, through: id.through }))
            ])

        await interaction.update({
            embeds: [embed],
            components: [row],
        })
    } else {
        if(date == "now") {
            await lockGame();

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
            await setFuture(date, false, true);

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