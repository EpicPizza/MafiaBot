import { ChannelType, Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getGameByID, getGlobal } from "../utils/main";
import { z } from "zod";
import { Setup, getSetup } from "../utils/setup";
import { getUser, getUserByChannel } from "../utils/user";
import { firebaseAdmin } from "../firebase";
import { Global } from "../utils/main";
import { checkMod } from "../utils/mod";
import { Extension, ExtensionInteraction } from "../utils/extensions";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `A simple extension for big booms and equivalents:

**?boom sponser {on|off}** Sends a #bigboom sponser when channel unlocks.

**?boom keyword {keyword(s)} | {say(s)}** Adds a keyword, or removes it if it already exists.

**?boom freeze** Terminates all ongoing big booms.

**?boom limit {number}** The maximum ammount of big booms there can be.

**?boom blacklist {channel|category|server} {on|off}** Blacklists a channel or category from big booms.

**?boom whitelist {channel|category} {on|off}** Whitelists a channel or category from a blacklisted category.

**?boom deadchat {on|off}** Creates a deadchat channel where people can #bigboom.
`

const rateLimit = new Map<string, number[]>();

let freeze = true;

module.exports = {
    name: "Booms",
    emoji: "💥",
    commandName: "boom",
    description: "Brought to you by #bigboom.",
    priority: [ ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "sponser",
            arguments: {
                required: [ z.union([ z.literal('on'), z.literal('off') ]) ],
            },
        },
        {
            name: "setup",
            arguments: {
                required: [ z.literal('iamverysureaboutthis.') ]
            },
        },
        {
            name: "keyword",
            arguments: {
                optional: [ "*" ]
            },
        },
        {
            name: "freeze",
            arguments: {},
        },
        {
            name: "limit",
            arguments: {
                required: [ z.number() ]
            }
        },
        {
            name: "blacklist",
            arguments: {
                required: [ 
                    z.union([ z.literal('channel'), z.literal('category'), z.literal('server')]), 
                    z.union([ z.literal('on'), z.literal('off')]) 
                ]
            }
        },
        {
            name: "whitelist",
            arguments: {
                required: [ 
                    z.union([ z.literal('channel'), z.literal('category')]), 
                    z.union([ z.literal('on'), z.literal('off')]) 
                ]
            }
        },
        {
            name: "deadchat",
            arguments: {
                required: [ z.union([ z.literal('on'), z.literal('off') ]) ],
            },
        },
    ] satisfies CommandOptions[],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('wills'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {},
    onUnlock: async (global, setup, game, incremented: boolean) => {},
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        /*const setup = await getSetup();
        const global = await getGlobal();
        
        const db = firebaseAdmin.getFirestore();

        if(command.name == "setup") {
            const ref = db.collection('booms').doc('settings');

            await ref.set({
                sponser: false,
                deadchat: false,
                limit: 10,
                keywords: [
                    {
                        key: "booms",
                        say: "boom"
                    },
                    {
                        key: "meows",
                        say: "no meow",
                    }
                ],
            });

            command.message.react("✅");
        } else if(command.name == "sponser") {
            const set = command.arguments[0] as string;

            const ref = db.collection('booms').doc('settings');

            await ref.update({
                sponser: set == 'on',
            });
        } else if(command.name == "keyword")

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message: Message, cache: Cache) => {

        if(message.author.id == process.env.OWNER && message.content == "freeze") {
            freeze = !freeze;

            if(!freeze) {
                message.react("✅");
            } else {
                message.react("<:cross:1258228069156655259>");
            }
        }

        if(message.content.toLowerCase().includes("ts pmo") && message.author.bot == false && message.guildId != "569988266657316884") {
            await message.reply("ts pmo 🥀");
        }

        if(message.content.toLowerCase().includes("big boom") && message.author.bot == false && message.guildId != "569988266657316884") {
            const index = message.content.toLowerCase().indexOf("big boom");

            let numberString = "";

            for(let i = index - 2; i >= 0; i--) {
                if(!isNaN(parseInt(message.content.charAt(i)))) {
                    numberString = message.content.charAt(i) + numberString;
                } else {
                    break;
                }
            }

            let number = parseInt(numberString);

            if(!(number <= 10 || message.author.id == process.env.OWNER || (message.author.id == "1027069893092315176" && message.channelId == "1361209407400185976"))) number = 10;

            for(let i = 0; i < number; i++) {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(true);
                    }, 1000);
                })

                if(freeze) {
                    return;
                }

                //@ts-ignore
                await message.channel.send("BOOM 💥");
            }
        }

        if(message.content.toLowerCase().includes("big chomp") && message.author.bot == false  && message.guildId != "569988266657316884") {
            const index = message.content.toLowerCase().indexOf("big chomp");

            let numberString = "";

            for(let i = index - 2; i >= 0; i--) {
                if(!isNaN(parseInt(message.content.charAt(i)))) {
                    numberString = message.content.charAt(i) + numberString;
                } else {
                    break;
                }
            }

            let number = parseInt(numberString);

            if(!(number <= 10 || message.author.id == process.env.OWNER || (message.author.id == "1027069893092315176" && message.channelId == "1361209407400185976"))) number = 10;

            for(let i = 0; i < number; i++) {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(true);
                    }, 1000);
                });

                if(freeze) {
                    return;
                }

                //@ts-ignore
                await message.channel.send("CHOMP");
            }
        }

        if(message.content.toLowerCase().includes("big meow") && message.author.bot == false  && message.guildId != "569988266657316884") {
            const index = message.content.toLowerCase().indexOf("big meow");

            let numberString = "";

            for(let i = index - 2; i >= 0; i--) {
                if(!isNaN(parseInt(message.content.charAt(i)))) {
                    numberString = message.content.charAt(i) + numberString;
                } else {
                    break;
                }
            }

            let number = parseInt(numberString);

            if(!(number <= 10 || message.author.id == process.env.OWNER || (message.author.id == "1027069893092315176" && message.channelId == "1361209407400185976"))) number = 10;

            for(let i = 0; i < number; i++) {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(true);
                    }, 1000);
                });

                if(freeze) {
                    return;
                }

                //@ts-ignore
                await message.channel.send("NO MEOW");
            }
        }


        if(message.content.toLowerCase().startsWith("how long") && message.author.bot == false && message.guildId != "569988266657316884") {
            await message.reply(message.content.replaceAll(" ", "").replaceAll("\t", "").replaceAll("\n", "").replaceAll("]", "").replaceAll("[", "").replaceAll(")", "").replaceAll("(", "").replaceAll(".", "").replaceAll("?", "").replaceAll("!", "").replaceAll("'", "").replaceAll('"', "").replaceAll("`", "").replaceAll("~", "").replaceAll(";", "").replaceAll(",", ""));
        }

    },
    onEnd: async (global, setup, game) => {},
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {},
    onVotes: async (global, setup, game, board ) => { return ""; },
    onHammer: async (global: Global, setup: Setup, game, hammered: string) => {},
    onRemove: async (global, setup, game, removed: string) => {}
} satisfies Extension;

async function wait(milliseconds: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, milliseconds);
    })
}

async function getSettings() {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('booms').doc('settings');

    const data = (await ref.get()).data();

    if(data == undefined) throw new Error("Settings not set up.");

    return data as {
        sponser: boolean,
        deadchat: boolean,
        limit: number,
        keywords: {
            key: string,
            say: string
        }[],
    }
}