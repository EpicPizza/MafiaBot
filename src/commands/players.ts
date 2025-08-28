import { SlashCommandBuilder, ChatInputCommandInteraction, Colors, EmbedBuilder, AutocompleteInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder, ButtonInteraction } from "discord.js";
import { Data } from "../discord";
import { getGameByName, getGlobal } from "../utils/main";
import { getUser, getUsers, getUsersArray } from "../utils/user";
import { z } from "zod";
import { Command } from "../discord";
import { firebaseAdmin } from "../utils/firebase";
import { getSetup } from "../utils/setup";
import { getStats } from "../utils/stats";

const Format = z.union([ z.literal('complete'), z.literal('gxe'), z.literal('wr'), z.literal('alphabetical') ]);

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-players',
            command: new SlashCommandBuilder()
                .setName("players")
                .setDescription("Show players.")
                .addStringOption(option =>
                    option  
                        .setName('game')
                        .setDescription('Name of the game.')
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option 
                        .setName('day')
                        .setDescription('From which day to show players of.')
                )
                .addStringOption(option => 
                    option
                        .setName('format')
                        .setDescription('What format to show the players in.')
                        .setChoices([
                            {
                                name: "complete",
                                value: "complete",
                            },
                            {
                                name: "gxe",
                                value: "gxe",
                            },
                            {
                                name: "wr",
                                value: "wr",
                            },
                            {
                                name: "alphabetical",
                                value: "alphabetical",
                            }
                        ])
                )
        }, 
        {
            type: 'text',
            name: 'text-players',
            command: {
                optional: [
                    z.union([z.string().min(1).max(100), z.number()]).or(Format),
                    Format
                ]
            }
        },
        {
            type: 'text',
            name: 'text-signups',
            command: {
                optional: [
                    z.string().min(1).max(100).or(Format),
                    Format
                ]
            }
        },
        {
            type: 'text',
            name: 'text-pl',
            command: {
                optional: [
                    z.union([z.coerce.number().min(1).max(100), z.string().min(1).max(100)]).or(Format),
                    Format
                ]
            }
        },
        {
            type: 'button',
            name: 'button-players',
            command: z.object({
                name: z.literal('players'),
                game: z.string(),
                complete: z.boolean(),
            })
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | AutocompleteInteraction | Command) => {
        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused();

            const games = await getGames();

            const filtered = games.filter(choice => choice.name.startsWith(focusedValue)).slice(0, 25);;

            await interaction.respond(
                filtered.map(choice => ({ name: choice.name, value: choice.name })),
            );

            return;
        } 

        return handlePlayerList(interaction);
    }
}

async function handlePlayerList(interaction: ChatInputCommandInteraction | Command | ButtonInteraction) {
    const global = await getGlobal();

    const format = 'customId' in interaction ? JSON.parse(interaction.customId).format as ReturnType<typeof checkType> 
        : interaction.type == 'text' ? checkType(interaction.arguments[1]) ?? checkType(interaction.arguments[0]) 
        : checkType(interaction.options.getString('format'));

    console.log("FORMAT", format);

    let users = [] as { nickname: string, id: string }[];

    let reference = 'customId' in interaction ? JSON.parse(interaction.customId).game as string 
        : interaction.type == 'text' ? checkType(interaction.arguments[0]) ? null : interaction.arguments[0] as string | number | null ?? null : interaction.options.getString("game");
    
    const day = 'customId' in interaction ? null : interaction.type == 'text' ? (typeof reference == "number" ? reference : null) : interaction.options.getInteger("day");

    const games = await getGames();

    if(typeof reference == 'string') {
        const game = await getGameByName(reference);

        if(game == null) throw new Error("Game not found.");

        users = await getUsersArray(game.signups);  
    } else if(day != null) {
         const db = firebaseAdmin.getFirestore();

        if(global.started == false) throw new Error("Game has not started.");

        const currentPlayers = (await db.collection('day').doc(day.toString()).get()).data()?.players as string[] | undefined ?? [];

        if(currentPlayers.length == 0) throw new Error("No data available.");

        users = await getUsersArray(currentPlayers);
    } else if(global.started == false && games.length == 1) {
        const game = await getGameByName(games[0].name);
        
        if(game == null) throw new Error("Game not found.");

        reference = game.name;
        users = await getUsersArray(game.signups);  
    } else if(global.started == false && !('customId' in interaction)) {
        const embed = new EmbedBuilder()
            .setTitle("Game has not started.")
            .setDescription("Choose a game to show its signups.")
            .setColor(Colors.Red)
            
        const rows = [] as ActionRowBuilder<ButtonBuilder>[]

        for(let i = 0; i < games.length; i = i + 5) {
            const row = new ActionRowBuilder<ButtonBuilder>();
    
            row.addComponents(games.filter((game, index) => index >= i && index <= i + 4).map(game => {
                return new ButtonBuilder()
                    .setLabel(game.name)
                    .setCustomId(JSON.stringify({ name: "players", game: game.name, format: format }))
                    .setStyle(ButtonStyle.Primary);
            }));
    
            rows.push(row);
        }

        if(rows.length == 0) {
            const row = new ActionRowBuilder<ButtonBuilder>();

            row.addComponents([
                new ButtonBuilder()
                    .setLabel("No Games")
                    .setCustomId(JSON.stringify({ name: "never "}))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            ]);

            rows.push(row);
        } 

        return await interaction.reply({ embeds: [embed], components: rows });
    } else if(global.started == false && 'customId' in interaction) {
        throw new Error("Invalid button!");
    } else {
        users = await getUsersArray(global.players.map(player => player.id));
    }

    const stats = await getStats();

    if(format == 'alphabetical') {
        users.sort((a, b) => {
            if (a.nickname < b.nickname) return -1;
            if (a.nickname > b.nickname) return 1;
            return 0;
        });
    }

    if((format == 'gxe' || format == 'wr') && stats == false) throw new Error("No stats!");

    const embed = new EmbedBuilder()
        .setTitle(typeof reference == 'string' || day == null ? "Players - " + users.length : "Players » Day " + day ) 
        .setColor(Colors.Purple)
        .setDescription(users.length == 0 ? "No Players" : users.reduce((previous, current) => previous += ((user) => {
            const stat = !stats ? undefined : stats.find(stat => stat.player.toLowerCase() == current.nickname.toLowerCase());

            switch(format) {
                case 'complete':
                    return user.nickname + " - <@" + user.id + ">";
                case 'gxe':
                    return user.nickname + (stat ? " (" + stat.gxe + ")" : " (N/A)");
                case 'wr':
                    return user.nickname + (stat ? " (" + stat.wr + ")" : " (N/A)");
                default:
                    return user.nickname;
            }
        })(current) + "\n", ""))
        .setFooter({ text: reference == null || reference == "" || typeof reference == 'number' ? "Showing " + users.length + " game player" + (users.length == 1 ? "" : "s") + "." : "Showing signups for " + reference + "." });

    if('customId' in interaction) {
        await interaction.message.edit({ embeds: [embed], components: [] });
    } else {
        await interaction.reply({ embeds: [embed] });
    }
}

async function getGames() {
    const db = firebaseAdmin.getFirestore();

    const setup = await getSetup();
        
    const ref = db.collection('settings').doc('game').collection('games');        
    const docs = (await ref.get()).docs;
    
    const games = [] as { name: string, id: string, url: string | null }[];
    
    for(let doc = 0; doc < docs.length; doc++) {
        const data = docs[doc].data();

        if(!data) continue;

        if(data.message == null) {
            games.push({
                name: data.name,
                id: docs[doc].id,
                url: null
            })
        } else {
            games.push({
                name: data.name,
                id: docs[doc].id,
                url: "https://discord.com/channels/" + setup.primary.guild.id + "/" + setup.primary.chat.id + "/" + data.message.id
            })
        }
    };

    return games;
}

function checkType(type: unknown) {
    const parsed = Format.safeParse(type);

    if(parsed.success) {
        return parsed.data;
    } else {
        return undefined;
    }
}