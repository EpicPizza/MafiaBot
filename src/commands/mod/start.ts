import { ActionRowBuilder, APIActionRowComponent, APIButtonComponent, APISelectMenuComponent, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, ComponentType, EmbedBuilder, Message, ModalBuilder, ModalSubmitInteraction, SelectMenuBuilder, SelectMenuOptionBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Command, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByID, getGameByName, getGlobal, startGame } from "../../utils/main";
import { getUsers, getUsersArray } from "../../utils/user";
import { getGameSetup } from "../../utils/games";
import { getSetup } from "../../utils/setup";
import { firebaseAdmin } from "../../firebase";

export const StartCommand = {
    name: "start",
    description: "?mod start {name}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("start")
            .setDescription("Starts the mafia game.")
            .addStringOption(option =>
                option  
                    .setName('game')
                    .setDescription('Name of the game.')
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        text: {
            required: [ z.string().min(1).max(100) ]
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const name = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        const game = await getGameByName(name);
        
        if(game == null) throw new Error("")

        const global = await getGlobal();

        if(global.started == true) throw new Error("Game has already started."); ;

        const confirmed = game.signups.map(signup => game.confirmations.includes(signup)).filter(confirmation => confirmation);
        if(confirmed.length != game.signups.length) throw new Error("Not everyone has confirmed!");

        const users = await getUsersArray(game.signups);

        const embed = new EmbedBuilder()
            .setTitle("Confirm Game Start")
            .setColor(Colors.Orange)
            .setFields([
                {
                    name: 'Players',
                    value: users.reduce((prev, user) => prev + user.nickname + "\n", ""),
                    inline: true
                },
                {
                    name: 'Extensions',
                    value: global.extensions.length == 0 ? "None enabled." : global.extensions.join("\n"),
                    inline: true
                }
            ])

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder()
                    .setLabel("Start")
                    .setStyle(ButtonStyle.Success)
                    .setCustomId(JSON.stringify({ name: "start", for: interaction.user.id, game: name })),
                new ButtonBuilder()
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Secondary)
                    .setCustomId(JSON.stringify({ name: "cancel-start", for: interaction.user.id }))
            ])

        await interaction.reply({ embeds: [embed], components: [row] });
    }
}

export const StartButton = {
    type: 'button',
    name: 'button-start',
    command: z.object({
        name: z.literal("start"),
        for: z.string().min(1).max(100),
        game: z.string().min(1).max(100)
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        if(id.for != interaction.user.id) throw new Error("This is not for you!");

        await startGame(interaction, id.game as string);

        await setAlignments();
    }
}

export const CancelButton = {
    type: 'button',
    name: 'button-cancel-start',
    command: z.object({
        name: z.literal("cancel-start"),
        for: z.string().min(1).max(100),
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        if(id.for != interaction.user.id) throw new Error("This is not for you!");

        await interaction.message.delete();
    }
}

export const DefaultAlignment = {
    type: 'button',
    name: 'button-set-default',
    command: z.object({
        name: z.literal('set-default')
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected);

        const ref = db.collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = await getGlobal(t);

            for(let i = 0; i < global.players.length; i++) {
                if(selected.find(player => global.players[i].id == player)) {
                    global.players[i].alignment = null;
                }
            }

            t.update(ref, {
                players: global.players
            });
        });

        const rows = changeSelected(interaction, selected, "default");

        await interaction.update({ components: rows });
    }
}

export const MafiaAlignment = {
    type: 'button',
    name: 'button-set-mafia',
    command: z.object({
        name: z.literal('set-mafia')
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected);

        const ref = db.collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = await getGlobal(t);

            for(let i = 0; i < global.players.length; i++) {
                if(selected.find(player => global.players[i].id == player)) {
                    global.players[i].alignment = 'mafia';
                }
            }

            t.update(ref, {
                players: global.players
            });
        });

        const rows = changeSelected(interaction, selected, "mafia");

        await interaction.update({ components: rows });
    }
}

export const NeutralAlignment = {
    type: 'button',
    name: 'button-set-neutral',
    command: z.object({
        name: z.literal('set-neutral')
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected);

        const ref = db.collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = await getGlobal(t);

            for(let i = 0; i < global.players.length; i++) {
                if(selected.find(player => global.players[i].id == player)) {
                    global.players[i].alignment = 'neutral';
                }
            }

            t.update(ref, {
                players: global.players
            });
        });

        const rows = changeSelected(interaction, selected, "neutral");

        await interaction.update({ components: rows });
    }
}

export const CustomAlignment = {
    type: 'button',
    name: 'button-set-custom',
    command: z.object({
        name: z.literal('set-custom')
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        await getUsers(selected);

        const row = new ActionRowBuilder<TextInputBuilder>();

        row.addComponents(new TextInputBuilder()
            .setCustomId('alignment')
            .setLabel('Alignment Name')
            .setStyle(TextInputStyle.Short)
        );

        const modal = new ModalBuilder()
            .setTitle('Set Custom Alignment')
            .setCustomId(JSON.stringify({ name: 'custom-alignment', message: interaction.message.id }))
            .addComponents(row);

        await interaction.showModal(modal);
    }
}

export const CustomModal = {
    type: 'modal', 
    name: 'modal-custom-alignment',
    command: z.object({
        name: z.literal("custom-alignment"),
        message: z.string(),
    }),
    execute: async (interaction: ModalSubmitInteraction) =>{
        const id = JSON.parse(interaction.customId);

        const global = await getGlobal();
        if(global.started == false) throw new Error("Game has not started.");
        const game = await getGameByID(global.game ?? "---");
        const setup = await getSetup();
        if(game == null) throw new Error("Game not found.");
        if(game.signups.length == 0) throw new Error("Game must have more than one player.");
        const gameSetup = await getGameSetup(game, setup);

        const message = await gameSetup.spec.messages.fetch(id.message);
        const selected = getSelected(message);

        const alignment = interaction.fields.getTextInputValue('alignment');
        if(alignment == "") throw new Error("Alignment field cannot be empty.");

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected);

        const ref = db.collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = await getGlobal(t);

            for(let i = 0; i < global.players.length; i++) {
                if(selected.find(player => global.players[i].id == player)) {
                    global.players[i].alignment = alignment;
                }
            }

            t.update(ref, {
                players: global.players
            });
        });

        const rows = changeSelected(message, selected, alignment);

        await message.edit({ components: rows });

        await interaction.reply({ content: "Alignment set.", ephemeral: true });
    }
}

export const AlignmentSelect = {
    type: 'select',
    name: 'select-alignment-player',
    command: z.object({
        name: z.literal("alignment-player"),
        page: z.number(),
    }),
    execute: async (interaction: StringSelectMenuInteraction) => {
        const values = interaction.values;
       
        const rowComponents = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent | APISelectMenuComponent>[]

        for(let i = 0; i < rowComponents.length; i++) {
            for(let j = 0; j < rowComponents[i].components.length; j++) {
                const component = rowComponents[i].components[j];

                if(('style' in component && !('custom_id' in component))) continue;

                if(component.custom_id == interaction.customId && component.type == ComponentType.StringSelect) {
                    component.options.forEach(option => {
                        option.default = !!values.find(value => value == option.value);
                    });
                }

                if(component.type == ComponentType.Button &&  component.label != "Finish") {
                    component.disabled = values.length == 0;
                }
            }
        }

        await interaction.update({ components: rowComponents });
    }
}

function changeSelected(interaction: ButtonInteraction | Message, selected: string[], alignment: string) {
     const rowComponents = ('message' in interaction ? interaction.message.toJSON() as any : interaction.toJSON() as any).components as APIActionRowComponent<APIButtonComponent | APISelectMenuComponent>[];

    for(let i = 0; i < rowComponents.length; i++) {
        for(let j = 0; j < rowComponents[i].components.length; j++) {
            const component = rowComponents[i].components[j];

            if(('style' in component && component.style == ButtonStyle.Link) || component.type != ComponentType.StringSelect) continue;

            component.options.forEach(option => {
                if(selected.find(player => player == option.value)) {
                    switch(alignment) {
                        case 'default': 
                            option.description = "Default Alignment";
                            option.emoji = "💼" as any;
                            break;
                         case 'neutral':
                            option.description = "Neutral Alignment";
                            option.emoji = "📎" as any;
                            break;
                        case 'mafia':
                            option.description = "Mafia Alignment";
                            option.emoji = "🔪" as any;
                            break;
                        default:
                            option.description = "Custom Alignment (" + alignment + ")";
                            option.emoji = "🎲" as any;
                            break;
                    }
                }
            });
        }
    }

    return rowComponents;
}

function getSelected(interaction: ButtonInteraction | Message) {
    const rowComponents = ('message' in interaction ? interaction.message.toJSON() as any : interaction.toJSON() as any).components as APIActionRowComponent<APIButtonComponent | APISelectMenuComponent>[];

    const selected = [] as string[];

    for(let i = 0; i < rowComponents.length; i++) {
        for(let j = 0; j < rowComponents[i].components.length; j++) {
            const component = rowComponents[i].components[j];

            if(('style' in component && component.style == ButtonStyle.Link) || component.type != ComponentType.StringSelect) continue;

            component.options.forEach(option => {
                if(option.default) {
                    selected.push(option.value);
                }
            });
        }
    }

    return selected;
}

async function setAlignments() {
    const embed = new EmbedBuilder()
        .setTitle("Set Alignments")
        .setColor(Colors.Orange)
        .setDescription('Everyone starts at default alignment. Select players to change their alignment. Mafia alignment adds them to mafia server. Custom alignment behave the same default alignment, some extensions may treat this alignment differently.\n\nOnce done setting alignments, click the finish button.')

    const global = await getGlobal();

    if(global.game == null) throw new Error("Game not found.");

    const game = await getGameByID(global.game);
    const setup = await getSetup();

    if(setup == undefined) throw new Error("Setup not complete.");
    if(typeof setup == 'string') throw new Error("An unexpected error occurred.");
    if(!global.started) throw new Error("Game has not started.");
    if(game == null) throw new Error("Game not found.");
    if(game.signups.length == 0) throw new Error("Game must have more than one player.");

    const gameSetup = await getGameSetup(game, setup);

    const rows = [] as ActionRowBuilder<SelectMenuBuilder | ButtonBuilder>[];

    const users = await getUsers(game.signups);
    const players = game.signups.map(signup => users.get(signup)).filter(player => player != undefined);


    rows.push(new ActionRowBuilder<SelectMenuBuilder>()
        .addComponents(new StringSelectMenuBuilder()
            .setCustomId(JSON.stringify({ name: "alignment-player", page: 1 }))
            .setPlaceholder("Choose the player(s) to change alignment")
            .setMaxValues(players.length)
            .setMinValues(0)
            .setOptions(players.map(player => 
                new StringSelectMenuOptionBuilder()
                    .setValue(player.id)
                    .setLabel(player.nickname)
                    .setEmoji('💼')
                    .setDescription("Default Alignment")
            ))
        )  
    );

    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(new ButtonBuilder()
        .setCustomId(JSON.stringify({ name: "set-default" }))
        .setLabel("Set Default")
        .setEmoji('💼')
        .setDisabled(true)
        .setStyle(ButtonStyle.Secondary)
    );

    row.addComponents(new ButtonBuilder()
        .setCustomId(JSON.stringify({ name: "set-neutral" }))
        .setLabel("Set Neutral")
        .setEmoji('📎')
        .setDisabled(true)
        .setStyle(ButtonStyle.Secondary)
    );

    row.addComponents(new ButtonBuilder()
        .setCustomId(JSON.stringify({ name: "set-mafia" }))
        .setLabel("Set Mafia")
        .setEmoji('🔪')
        .setDisabled(true)
        .setStyle(ButtonStyle.Danger)
    );

    row.addComponents(new ButtonBuilder()
        .setCustomId(JSON.stringify({ name: "set-custom" }))
        .setLabel("Set Custom")
        .setEmoji('🎲')
        .setDisabled(true)
        .setStyle(ButtonStyle.Primary)
    );

    rows.push(row);

    rows.push(new ActionRowBuilder<ButtonBuilder>()
        .addComponents([
            new ButtonBuilder()
                .setLabel("Finish")
                .setStyle(ButtonStyle.Primary)
                .setCustomId(JSON.stringify({ name: 'confirm-alignments' }))
        ])
    );

    await gameSetup.spec.send({ embeds: [embed], components: rows });
}

