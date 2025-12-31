import { Command } from "commander";
import { randomInt } from "crypto";
import { Colors, EmbedBuilder } from "discord.js";
import { z } from "zod";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { simpleJoin } from '../utils/text';
import { fromZod } from '../utils/text';
import { getUserByName, getUsersArray, User } from "../utils/mafia/user";
import { Instance } from "../utils/instance";

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-random',
            /*command: {
                required: [ z.union([z.literal('pl'), z.literal('number')]), ],
                optional: [ z.string(), z.union([z.coerce.number(), z.string() ]), "*" ]
            }*/
            command: () => {
                return new Command()
                    .name('random')
                    .description('Visit ?help for a useful help description. Since this command does not have real subcommands, this keeps the structure of a pre-revamp text command. Alejandro was too lazy to convert it to a proper subcommand set.')
                    .argument('<arg1>', 'argument 1', fromZod(z.union([z.literal('pl'), z.literal('number')])))
                    .argument('[arg2]', 'argument 2')
                    .argument('[arg3]', 'argument 3', fromZod(z.union([z.coerce.number(), z.string() ])))
                    .argument('[arg4...]', 'argument 4', simpleJoin)
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Event<TextCommand>) => {
        interaction.inInstance();

        const arg1 = interaction.program.processedArgs[0] as 'pl' | 'number'
        const arg2 = interaction.program.processedArgs[1] as 'list' | 'number' | string;
        const arg3 = interaction.program.processedArgs[2] as number | string;
        const arg4 = interaction.program.processedArgs[3] as undefined | string;

        console.log(interaction.program.processedArgs);

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
                    const users = await getUsersByName(list, interaction.instance);

                    embed.setDescription(users.map(user => {
                        return user.nickname + " - " + getRandom(min, max)
                    }).reduce((prev, curr) => prev + "\n" + curr, ""));
                } else {
                    const global = interaction.instance.global;
                    if(global.started == false) throw new Error("Game has not started!");

                    const users = await getUsersArray(global.players.map(player => player.id), interaction.instance);

                    embed.setDescription(users.map(user => {
                        return user.nickname + " - " + getRandom(min, max)
                    }).reduce((prev, curr) => prev + "\n" + curr, ""));
                }
            } else if(plSubcommand == 'list') {
                if(list != undefined) {
                    const users = await getUsersByName(list, interaction.instance);

                    const shuffled = [...users];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = randomInt(i + 1);
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    
                    const selected = shuffled.slice(0, count == undefined ? shuffled.length : count);

                    embed.setDescription(selected.map(user => user.nickname).join('\n'));
                } else if(list == undefined) {
                    const global = interaction.instance.global;
                    if(global.started == false) throw new Error("Game has not started!");

                    const users = await getUsersArray(global.players.map(player => player.id), interaction.instance);

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

async function getUsersByName(names: string[], instance: Instance) {
    const users = await Promise.all(names.map(name => getUserByName(name, instance)));

    if(users.filter(user => user == undefined).length > 0) throw new Error("User not found!");

    return users as User[];
}

function getRandom(min: number | undefined, max: number | undefined) {
    if(max == undefined || min == undefined) throw new Error("Range must be set!");

    return randomInt(min, max + 1);
}