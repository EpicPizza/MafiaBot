import { Command } from "commander";
import { ActionRowBuilder, APIActionRowComponent, APIButtonComponent, APISelectMenuComponent, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, ComponentType, EmbedBuilder, Message, ModalBuilder, ModalSubmitInteraction, SelectMenuBuilder, SlashCommandSubcommandBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { firebaseAdmin } from "../../utils/firebase";
import { getGameByID, getGameByName, getGameSetup } from "../../utils/mafia/games";
import { startGame } from "../../utils/mafia/main";
import { getUsers, getUsersArray } from "../../utils/mafia/user";
import { getSetup, Setup } from "../../utils/setup";
import { Subinteraction } from "../../utils/subcommands";
import { Global } from "../../utils/global";
import { Instance } from "../../utils/instance";

export const StartCommand = {
    name: "start",
    subcommand: true,

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
    text: () => {
        return new Command()
            .name('start')
            .description('Starts the game. Locks the channel. Setups player dms. Kicks everyone from mafia server. Sends message in spectator chat to setup alignments (which will invite mafia to mafia server after confirming).')
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        const game = await getGameByName(name, interaction.instance);
        
        if(game == null) throw new Error("")

        const global = interaction.instance.global;

        if(global.started == true) throw new Error("Game has already started."); ;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('sessions').doc(interaction.user.id);

        const token = crypto.randomUUID();

        await ref.set({
            token: token,
            timestamp: new Date().valueOf(),
        }, { merge: true });

        const url = new URL((process.env.DEV == "TRUE" ? process.env.DEVDOMAIN ?? "-" : process.env.DOMAIN ?? "-") + "/session/discord");

        url.searchParams.set("id", interaction.user.id);
        url.searchParams.set("token", token);
        url.searchParams.set("redirect", "/" + (interaction.instance.id) + "/mod/" + game.id + "/start");

        const embed = new EmbedBuilder()
            .setTitle("Start " + game.name + " Mafia")
            .setDescription("Here's a link to start the game:")
            .setFooter({ text: "Do not share or screenshot this link with anyone, this link is only meant for you." })
            .setColor(Colors.Yellow);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents([
                new ButtonBuilder()
                    .setLabel("Start")
                    .setStyle(ButtonStyle.Link)
                    .setURL(url.toString()),
            ]);

        if(interaction.type == "text") {
            throw new Error("Please use text command.");
        } else {
            await interaction.reply({ ephemeral: true, embeds: [embed], components: [row] });
        }
    }
}

export const WebsiteStartCommand = {
    name: "websitestart",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("websitestart")
        .setDescription("Starts the mafia game.")
        .addStringOption(option =>
            option  
                .setName('game')
                .setDescription('Name of the game.')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    text: () => {
        return new Command()
            .name('websitestart')
            .description('Starts the game. Locks the channel. Setups player dms. Kicks everyone from mafia server. Sends message in spectator chat to setup alignments (which will invite mafia to mafia server after confirming).')
            .argument('<game>', 'name of game', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const name = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('game');

        if(name == null) throw new Error("Game needs to be specified.");

        const game = await getGameByName(name, interaction.instance);
        
        if(game == null) throw new Error("")

        const global = interaction.instance.global;

        if(global.started == true) throw new Error("Game has already started."); ;

        await startGame(interaction, game.name as string, interaction.instance);

        await setAlignments(interaction.instance);
    }
}

export const StartButton = {
    type: 'button',
    name: 'button-start',
    subcommand: true,

    command: z.object({
        name: z.literal("start"),
        for: z.string().min(1).max(100),
        game: z.string().min(1).max(100)
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();

        const id = JSON.parse(interaction.customId);

        if(id.for != interaction.user.id) throw new Error("This is not for you!");

        await startGame(interaction, id.game as string, interaction.instance);

        await setAlignments(interaction.instance);
    }
} satisfies Subinteraction;

export const CancelButton = {
    type: 'button',
    name: 'button-cancel-start',
    subcommand: true,

    command: z.object({
        name: z.literal("cancel-start"),
        for: z.string().min(1).max(100),
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        const id = JSON.parse(interaction.customId);

        if(id.for != interaction.user.id) throw new Error("This is not for you!");

        await interaction.message.delete();
    }
} satisfies Subinteraction;

export const DefaultAlignment = {
    type: 'button',
    name: 'button-set-default',
    subcommand: true,

    command: z.object({
        name: z.literal('set-default')
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();
        
        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected, interaction.instance);

        const ref = db.collection('instances').doc(interaction.instance.id).collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = interaction.instance.global;

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
} satisfies Subinteraction;
 
export const MafiaAlignment = {
    type: 'button',
    name: 'button-set-mafia',
    subcommand: true,

    command: z.object({
        name: z.literal('set-mafia')
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();

        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected, interaction.instance);

        const ref = db.collection('instances').doc(interaction.instance.id).collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = interaction.instance.global;

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
} satisfies Subinteraction;

export const NeutralAlignment = {
    type: 'button',
    name: 'button-set-neutral',
    subcommand: true,

    command: z.object({
        name: z.literal('set-neutral')
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();

        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected, interaction.instance);

        const ref = db.collection('instances').doc(interaction.instance.id).collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = interaction.instance.global;

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
} satisfies Subinteraction;
 
export const CustomAlignment = {
    type: 'button',
    name: 'button-set-custom',
    subcommand: true,

    command: z.object({
        name: z.literal('set-custom')
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();

        const id = JSON.parse(interaction.customId);

        const selected = getSelected(interaction);

        await getUsers(selected, interaction.instance);

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
} satisfies Subinteraction;

export const CustomModal = {
    type: 'modal', 
    name: 'modal-custom-alignment',
    subcommand: true,

    command: z.object({
        name: z.literal("custom-alignment"),
        message: z.string(),
    }),

    execute: async (interaction: Event<ModalSubmitInteraction>) =>{
        interaction.inInstance();

        const id = JSON.parse(interaction.customId);

        const global = interaction.instance.global;
        if(global.started == false) throw new Error("Game has not started.");
        const game = await getGameByID(global.game ?? "---", interaction.instance);
        const setup = interaction.instance.setup;
        if(game == null) throw new Error("Game not found.");
        if(game.signups.length == 0) throw new Error("Game must have more than one player.");
        const gameSetup = await getGameSetup(game, setup);

        const message = await gameSetup.spec.messages.fetch(id.message);
        const selected = getSelected(message);

        const alignment = interaction.fields.getTextInputValue('alignment');
        if(alignment == "") throw new Error("Alignment field cannot be empty.");

        const db = firebaseAdmin.getFirestore();

        await getUsers(selected, interaction.instance);

        const ref = db.collection('instances').doc(interaction.instance.id).collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = interaction.instance.global;

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
} satisfies Subinteraction;

export const AlignmentSelect = {
    type: 'select',
    name: 'select-alignment-player',
    subcommand: true,

    command: z.object({
        name: z.literal("alignment-player"),
        page: z.number(),
    }),

    execute: async (interaction: Event<StringSelectMenuInteraction>) => {
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
} satisfies Subinteraction;

function changeSelected(interaction: Event<ButtonInteraction> | Message, selected: string[], alignment: string) {
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

function getSelected(interaction: Event<ButtonInteraction> | Message) {
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

export async function setAlignments(instance: Instance) {
    const embed = new EmbedBuilder()
        .setTitle("Set Alignments")
        .setColor(Colors.Orange)
        .setDescription('Everyone starts at default alignment. Select players to change their alignment. Mafia alignment adds them to mafia server. Custom alignment behave the same default alignment, some extensions may treat this alignment differently.\n\nOnce done setting alignments, click the finish button.')

    if(instance.global.game == null) throw new Error("Game not found.");

    const game = await getGameByID(instance.global.game, instance);

    if(instance.setup == undefined) throw new Error("Setup not complete.");
    if(typeof instance.setup == 'string') throw new Error("An unexpected error occurred.");
    if(!instance.global.started) throw new Error("Game has not started.");
    if(game == null) throw new Error("Game not found.");
    if(game.signups.length == 0) throw new Error("Game must have more than one player.");

    const gameSetup = await getGameSetup(game, instance.setup);

    const rows = [] as ActionRowBuilder<SelectMenuBuilder | ButtonBuilder>[];

    const users = await getUsers(game.signups, instance);
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

