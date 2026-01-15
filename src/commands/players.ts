import { Command } from "commander";
import { ActionRowBuilder, AutocompleteInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { fromZod } from '../utils/text';
import { firebaseAdmin } from "../utils/firebase";
import { getGameByID, getGameByName } from "../utils/mafia/games";
import { getStats } from "../utils/mafia/stats";
import { getUsersArray, User } from "../utils/mafia/user";
import { Setup } from "../utils/setup";
import { Instance } from "../utils/instance";

const Format = z.union([ z.literal('complete'), z.literal('gxe'), z.literal('wr'), z.literal('alphabetical'), z.literal('pronouns') ]);

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-players',
            command: new SlashCommandBuilder()
                .setName("players")
                .setDescription("Show signups for a game, current game players, or game players from a day.")
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
                            },
                            {
                                name: "pronouns",
                                value: "pronouns"
                            }
                        ])
                )
        }, 
        {
            type: 'text',
            name: 'text-players',
            command: () => {
                return new Command()
                    .name('players')
                    .alias('pl')
                    .alias('signups')
                    .description('Show players of a current game or signups by specifying a game.')
                    .argument('[day]', 'which day to show from (during running game)', fromZod(z.coerce.number().min(1).max(100)))
                    .option('-g, --game <name>', 'which game to show signups from', fromZod(z.string().min(1).max(100)))
                    .option('-f, --format <type>', 'types: complete, gxe, wr, alphabetical, pronouns', fromZod(Format))
            }
        },
        {
            type: 'button',
            name: 'button-players',
            command: z.object({
                name: z.literal('players'),
                game: z.string(),
                format: z.string().optional(),
            })
        }
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | AutocompleteInteraction | TextCommand>) => {
        interaction.inInstance();

        if(interaction.type != 'text' && interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused();

            const games = await getGames(interaction.instance);

            const filtered = games.filter(choice => choice.name.startsWith(focusedValue)).slice(0, 25);;

            await interaction.respond(
                filtered.map(choice => ({ name: choice.name, value: choice.name })),
            );

            return;
        } 

        return handlePlayerList(interaction);
    }
}

async function handlePlayerList(interaction: Event<ChatInputCommandInteraction | TextCommand | ButtonInteraction>) {
    interaction.inInstance();

    const global = interaction.instance.global;

    const format = 'customId' in interaction ? JSON.parse(interaction.customId).format as ReturnType<typeof checkType> 
        : interaction.type == 'text' ? checkType(interaction.program.getOptionValue('format'))
        : checkType(interaction.options.getString('format'));

    console.log("FORMAT", format);

    let users = [] as User[];

    let reference = 'customId' in interaction ? JSON.parse(interaction.customId).game as string 
        : interaction.type == 'text' ? interaction.program.getOptionValue('game') as string | undefined ?? null : interaction.options.getString("game");
    
    const day = 'customId' in interaction ? null : interaction.type == 'text' ? (interaction.program.args.length > 0 ? interaction.program.processedArgs[0] as number : null) : interaction.options.getInteger("day");

    const games = await getGames(interaction.instance);

    if(typeof reference == 'string') {
        const game = await getGameByName(reference, interaction.instance, true);

        if(game == null) throw new Error("Game not found.");

        users = await getUsersArray(game.signups, interaction.instance);  
    } else if(day != null) {
        const db = firebaseAdmin.getFirestore();

        if(global.started == false) throw new Error("Game has not started.");

        const game = await getGameByID(global.game ?? "---", interaction.instance);

        if(game == null) throw new Error("Game not found. (current)");

        const currentPlayers = (await db.collection('instances').doc(interaction.instance.id).collection('games').doc(game.id).collection('days').doc(day.toString()).get()).data()?.players as string[] | undefined ?? [];

        if(currentPlayers.length == 0) throw new Error("No data available.");

        users = await getUsersArray(currentPlayers, interaction.instance);
    } else if(global.started == false && games.length == 1) {
        const game = await getGameByName(games[0].name, interaction.instance);
        
        if(game == null) throw new Error("Game not found.");

        reference = game.name;
        users = await getUsersArray(game.signups, interaction.instance);  
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
        users = await getUsersArray(global.players.map(player => player.id), interaction.instance);
    }

    const stats = await getStats(interaction.instance);

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
            if (!current?.nickname || !current?.id) {
              console.error("Invalid user object detected:", current);
              return "";
            }
            
            const stat = !stats ? undefined : stats.find(stat => stat.player.toLowerCase() == current.nickname.toLowerCase());

            switch(format) {
                case 'complete':
                    return user.nickname + " - <@" + user.id + ">";
                case 'gxe':
                    return user.nickname + (stat ? " (" + stat.gxe + ")" : " (N/A)");
                case 'wr':
                    return user.nickname + (stat ? " (" + stat.wr + ")" : " (N/A)");
                case 'pronouns':
                    return user.nickname + (user.pronouns ?  " (" + user.pronouns + ")" : "");
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

async function getGames(instance: Instance) {
    const db = firebaseAdmin.getFirestore();
        
    const ref = db.collection('instances').doc(instance.id).collection('games').where('state', '==', 'active');        
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
                url: "https://discord.com/channels/" + instance.setup.primary.guild.id + "/" + instance.setup.primary.chat.id + "/" + data.message.id
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
