import { ChatInputCommandInteraction, Colors, Embed, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from "discord.js";
import { Data } from "../discord";
import { getGlobal } from "../utils/main";
import { getUser, getUserByName, getUsersArray, User } from "../utils/user";
import { Command } from "../discord";
import { firebaseAdmin } from "../utils/firebase";
import { randomInt } from "crypto";
import { z } from "zod";

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-random',
            command: {
                required: [ z.union([z.literal('pl'), z.literal('number')]), ],
                optional: [ z.string(), z.union([z.coerce.number(), z.string() ]), "*" ]
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Command) => {
        const arg1 = interaction.arguments[0] as 'pl' | 'number'
        const arg2 = interaction.arguments[1] as 'list' | 'number' | string;
        const arg3 = interaction.arguments[2] as number | string;
        const arg4 = (interaction.arguments.length == 3 ? undefined : interaction.arguments[3]) as undefined | string;

        const subcommand = arg1;
        const min = typeof arg2 == 'string' && arg2.includes("-") && arg2.split("-").length == 2 ? parseFloat(arg2.split("-")[0]) : (typeof arg3 == 'string' && arg3.includes("-") && arg3.split("-").length == 2 ? parseFloat(arg3.split("-")[0]) : undefined);
        const max = typeof arg2 == 'string' && arg2.includes("-") && arg2.split("-").length == 2 ? parseFloat(arg2.split("-")[1]) : (typeof arg3 == 'string' && arg3.includes("-") && arg3.split("-").length == 2 ? parseFloat(arg3.split("-")[1]) : undefined);
        const plSubcommand = subcommand == 'pl' ? ( arg2 == 'list' || arg2 == 'number' ? arg2 : undefined ) : undefined;
        const count = typeof arg3 == 'number' ? arg3 : undefined;

        const list = (() => {
            const list = [] as string[];

            if(subcommand == 'pl' && plSubcommand == 'list') {
                if(typeof arg3 == 'string') {
                    list.push(arg3);
                }

                if(typeof arg4 == 'string') {
                    list.push(...arg4.split(" "));
                }
            }

            if(subcommand == 'pl' && plSubcommand == 'number' && typeof arg4 == 'string') {
                list.push(...arg4.split(" "));
            }

            return list.length == 0 ? undefined : list;
        })();

        console.log({
            subcommand,
            plSubcommand,
            min,
            max,
            count,
            list
        });

        if((min != undefined && min > 10000) || (max != undefined && max > 10000) || (count != undefined && count > 250)) throw new Error("Number too big!");

        if(subcommand == 'number') {
            if(count == undefined) {
                interaction.reply(getRandom(min, max).toString())
            } else {
                interaction.reply(new Array(count).fill(undefined).map(() => getRandom(min, max)).reduce((prev, curr) => prev + " " + curr, ""));
            }
        } else if(subcommand == 'pl') {
            const embed = new EmbedBuilder()
                .setTitle('Players')
                .setColor(Colors.Purple)

            if(plSubcommand == 'number') {
                if(list != undefined) {
                    const users = await getUsersByName(list);

                    embed.setDescription(users.map(user => {
                        return user.nickname + " - " + getRandom(min, max)
                    }).reduce((prev, curr) => prev + "\n" + curr, ""));
                } else {
                    const global = await getGlobal();
                    if(global.started == false) throw new Error("Game has not started!");

                    const users = await getUsersArray(global.players.map(player => player.id));

                    embed.setDescription(users.map(user => {
                        return user.nickname + " - " + getRandom(min, max)
                    }).reduce((prev, curr) => prev + "\n" + curr, ""));
                }
            } else if(plSubcommand == 'list') {
                if(list != undefined) {
                    const users = await getUsersByName(list);

                    const shuffled = [...users];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = randomInt(i + 1);
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    
                    const selected = shuffled.slice(0, count == undefined ? shuffled.length : count);

                    embed.setDescription(selected.map(user => user.nickname).join('\n'));
                } else if(list == undefined) {
                    const global = await getGlobal();
                    if(global.started == false) throw new Error("Game has not started!");

                    const users = await getUsersArray(global.players.map(player => player.id));

                    const shuffled = [...users];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = randomInt(i + 1);
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    
                    const selected = shuffled.slice(0, count == undefined ? shuffled.length : count);

                    embed.setDescription(selected.map(user => user.nickname).join('\n'));
                }
            } else if(plSubcommand == undefined) {
                throw new Error("Subcommand not found!");
            }

            await interaction.reply({ embeds: [embed] });
        }

    }
}

async function getUsersByName(names: string[]) {
    const users = await Promise.all(names.map(name => getUserByName(name)));

    if(users.filter(user => user == undefined).length > 0) throw new Error("User not found!");

    return users as User[];
}

function getRandom(min: number | undefined, max: number | undefined) {
    if(max == undefined || min == undefined) throw new Error("Range must be set!");

    return randomInt(min, max + 1);
}