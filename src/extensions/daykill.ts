import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, InteractionType, Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { getGameByID, getGlobal, lockGame, unlockGame, type Global } from "../utils/main";
import { z } from "zod";
import { Extension, ExtensionInteraction } from "../utils/extensions";
import { getSetup, Setup } from "../utils/setup";
import { getGameSetup, Signups } from "../utils/games";
import { firebaseAdmin } from "../utils/firebase";
import { checkMod } from "../utils/mod";
import { getUser, getUserByChannel, getUserByName } from "../utils/user";
import { getFuture } from "../utils/timing";
import { killPlayer } from "../commands/advance/kill";
import { removePlayer } from "../commands/mod/remove";
import { wipe } from "../utils/vote";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

let close: Function | null = null;

const help = `**?kill {nickname}** Command used by player to day kill. 

**?daykill set {type: mute|remove|hammer} {expire}** Used in the corresponding player dm channel. Expire is the number of days it expires after the current day. 

- Mute: mutes the player, must be removed later with ?mod remove. 
- Remove: completely removes player, giving them spectator perms. 
- Hammer: ends the day and doesn't automatically flip. 

Note: Setting expire to \`0\` will expire the current day, during night, set \`1\` to expire the day after.

**?daykill list** List all set day kills. Must be run in spectator chat.

**?daykill configure {type: cancel|mod} {minutes}** In the specified number of minutes before EOD, to either not allow day kills (cancel) or to require the mod to reveal and flip (mod).

**?daykill check** Show the configured state. Default: type mod, 20 minutes.`

module.exports = {
    name: "Daykill",
    emoji: "🔫",
    commandName: "daykill",
    description: "Adds day kill functionality to Mafia Bot.",
    priority: [],
    help: help,
    shorthands: [
        {
            name: "kill",
            to: "kill"
        }
    ],
    commands: [
        {
            name: "kill",
            arguments: {
                required: [ z.string() ],
                optional: []
            }
        },
        {
            name: "set",
            arguments: {
                required: [ z.union([z.literal('mute'), z.literal('remove'), z.literal('hammer')]), z.coerce.number() ],
                optional: []
            }
        },
        {
            name: "list",
            arguments: {},
        },
        {
            name: "configure",
            arguments: {
                required: [ z.union([z.literal('cancel'), z.literal('mod')]), z.coerce.number() ]
            }
        },
        {
            name: "check",
            arguments: {}
        }
    ] satisfies CommandOptions[],
    interactions: [
        {
            type: "button",
            name: "button-daykill-reveal-now",
            command: z.object({
                name: z.literal("daykill-reveal-now"),
                user: z.string(),
                type: z.union([z.literal('mute'), z.literal('remove')])
            })
        },
        {
            type: "button",
            name: "button-daykill-cancel-reveal",
            command: z.object({
                name: z.literal("daykill-cancel-reveal"),
            })
        }
    ],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await db.collection("daykill").doc('settings').set({
            type: "mod",
            minutes: 20,
        });

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {
        /**
         * Runs after game has locked.
         */

        console.log("Extension Lock");
    },
    onUnlock: async (global, setup, game, incremented) => {
        /**
         * Runa after game has unlocked.
         * 
         * incremented: boolean - Whether day has advanced or not.
         */

        console.log("Extension Unlock", incremented);

        return;

        /**
         * Nothing to return.
         */
    },
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const db = firebaseAdmin.getFirestore();
        const setup = await getSetup();
        const global = await getGlobal();

        if(global.started == false) throw new Error("Game has not started.");

        if(command.name == "kill") {
            const user = await getUser(command.user.id);
            if(user == undefined) throw new Error("User not found.");
            const player = global.players.find(player => player.id == user.id);
            if(player == undefined) throw new Error("You are not part of the game!");
            if(user.channel != command.message.channelId) throw new Error("Must be run in dead chat dm!");

            const daykill = await getDaykill(command.user.id);
            if(daykill == undefined) throw new Error("You don't have any day kills!");

            const killing = await getUserByName(command.arguments[0] as string);
            if(killing == undefined) throw new Error("Player not found!");
            const killingPlayer = global.players.find(player => player.id == killing.id);
            if(killingPlayer == undefined) throw new Error("Not part of this game!");

            if(global.locked == true) throw new Error("Game is locked!");
            console.log(daykill.day + daykill.expire, global.day);
            if(global.day >= daykill.day + daykill.expire) throw new Error("Your day kill has expired! You cannot use it.");

            const future = await getFuture();
            const settings = await getSettings();
            const eod =  future && (future.when.valueOf() - new Date().valueOf()) < (settings.minutes * 60 * 1000);

            if(eod && settings.type == 'cancel') throw new Error("Too close to end of day! Cannot day kill.");

            await command.message.react("✅");

            await db.collection('daykill').doc(user.id).delete();

            await lockGame();

            if(daykill.lock == 'hammer' || (eod && settings.type == 'mod')) {
                const content = "<@&" + setup.primary.alive.id + "> <@&" + setup.primary.mod.id + ">\n# " + killing.nickname + " has been killed!\n** **\nThe day has ended! Waiting on game mod to flip."

                await setup.primary.chat.send({ content: content });
            } else if(daykill.lock == "pause") {
                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents([
                        new ButtonBuilder()
                            .setLabel("Reveal Now")
                            .setStyle(ButtonStyle.Secondary)
                            .setCustomId(JSON.stringify({ name: "daykill-reveal-now", user: killing.id, type: daykill.type })),
                        new ButtonBuilder()
                            .setLabel("Cancel Reveal")
                            .setStyle(ButtonStyle.Danger)
                            .setCustomId(JSON.stringify({ name: "daykill-cancel-reveal" }))
                    ]);

                const content = "<@&" + setup.primary.alive.id + "> <@&" + setup.primary.mod.id + ">\n# " + killing.nickname + " has been killed!\n** **\n" ;

                const message = await setup.primary.chat.send({ 
                    content: content + "<a:loading:1256150236112621578> Alignment will be automatically revealed in 5 minutes.",
                    components: [row] 
                });

                let cancelled = false;

                close = async (success: boolean) => {
                    cancelled = true;

                    await message.edit({
                        content: content + (success ? "✅" : "<:cross:1258228069156655259>") + " Alignment will be automatically revealed in 5 minutes.",
                        components: []
                    });
                }

                await new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(0);
                    }, 5 * 60 * 1000);
                });

                if(cancelled) return;

                await message.edit({
                    content: content + "✅ Alignment will be automatically revealed in 5 minutes.",
                    components: [],
                });

                const final = await message.reply({
                    content: "<@&" + setup.primary.alive.id + ">\n# " + killing.nickname + " was **" + (killingPlayer.alignment == null || killingPlayer.alignment == "default" ? "town" : killingPlayer.alignment)  + "**!"
                });

                if(daykill.type == "mute") {
                    await killPlayer(killing.nickname, global, setup);
                } else {
                    await removePlayer(killing.nickname, global, setup);
                }

                const setMessage = await wipe(global, killing.nickname + " was " + killingPlayer.alignment + "!");

                await setMessage(final.id);

                await unlockGame(false);
            }  
        } else if(command.name == "set") {
            await checkMod(setup, global, command.user.id, command.message.guildId ?? "---");

            const type = command.arguments[0] as string;
            const lock = type == "hammer" ? "hammer" : "pause";
            const expire = command.arguments[1] as number;

            const user = await getUserByChannel(command.message.channelId);
            if(user == undefined) throw new Error("Command must be run in dead chat dm channel!");
            const player = global.players.find(player => player.id == user.id);
            if(player == undefined) throw new Error("Player not part of game?");

            await db.collection('daykill').doc(user.id).set({
                type: type,
                expire: expire,
                lock: lock,
                day: global.day,
            });

            await command.message.react("✅");
        } else if(command.name == "list") {
            await checkMod(setup, global, command.user.id, command.message.guildId ?? "---");

            const game = await getGameByID(global.game ?? "---");
            if(game == undefined) throw new Error("Game not found.");
            const gameSetup = await getGameSetup(game, setup);
            if(gameSetup.spec.id != command.message.channelId) throw new Error("Must be run in spectator channel.");

            const daykills = (await Promise.allSettled((await db.collection('daykill').get()).docs.map(async doc => {
                const data = doc.data();

                const user = await getUser(doc.id);
                if(user == undefined) throw new Error("User not found");
                const player = global.players.find(player => player.id == user.id);
                if(player == undefined) throw new Error("Player not part of game?");

                return {
                    type: data.type as string,
                    expire: data.expire as number + 1,
                    lock: data.lock as string,
                    day: data.day as number,
                    user: user,
                }
            }))).filter(promise => promise.status == "fulfilled").map(promise => promise.value);

            const description = daykills.map(kill => kill.user.nickname + " - (" + kill.type + ") Expires Day " + (kill.day + kill.expire)).reduce((prev, curr) => prev + curr + "\n", "");

            const embed = new EmbedBuilder()
                .setTitle("Day Kills Set")
                .setColor(Colors.DarkRed)
                .setDescription(description == "" ? "None set." : description)

            await command.reply({ embeds: [embed] });
        } else if(command.name == "configure") {
            await checkMod(setup, global, command.user.id, command.message.guildId ?? "---");

            const type = command.arguments[0] as string;
            const minutes = command.arguments[1] as number;

            await db.collection('daykill').doc('settings').set({
                type: type,
                minutes: minutes,
            });

            await command.message.react("✅");
        } else if(command.name == "check") {
            await checkMod(setup, global, command.user.id, command.message.guildId ?? "---");

            const settings = await getSettings();

            const embed = new EmbedBuilder()
                .setTitle('Day Kill Settings')
                .setColor(Colors.Yellow)
                .setDescription('Type: ' + settings.type + '\nMinutes: ' + settings.minutes);

            await command.reply({ embeds: [embed] });
        }

        return;

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {
        /**
         * Interactions for buttons, modals, and select menus. Context menu and slash commands not implemented.
         * 
         *  interaction: {
         *      customId: any,
         *      name: string,
         *      interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction
         *  }
         */

        if(!('customId' in extensionInteraction)) return;

        const setup = await getSetup();
        const global = await getGlobal();

        const interaction = extensionInteraction.interaction;
        const customId = extensionInteraction.customId;

        if(!('isButton' in interaction) || !interaction.isButton()) return;

        await checkMod(setup, global, interaction.user.id, interaction.guildId ?? "---");

        if(extensionInteraction.name == "button-daykill-cancel-reveal") {
            if(close) close(false);

            await interaction.reply("Automatic reveal cancelled.");
        } else if(extensionInteraction.name == "button-daykill-reveal-now") {
            if(close) close(true);
        
            const killing = await getUser(customId.user ?? "---");
            if(killing == undefined) throw new Error("Player not found!");
            const killingPlayer = global.players.find(player => player.id == killing.id);
            if(killingPlayer == undefined) throw new Error("Not part of this game!");

            const type = customId.type ?? "mute";

            const message = await interaction.message.reply({
                content: "<@&" + setup.primary.alive.id + ">\n# " + killing.nickname + " was **" + killingPlayer.alignment + "**!",
                components: [],
            });

            if(type == "mute") {
                await killPlayer(killing.nickname, global, setup);
            } else {
                await removePlayer(killing.nickname, global, setup);
            }

            const setMessage = await wipe(global, killing.nickname + " was " + killingPlayer.alignment + "!");

            await setMessage(message.id);

            await unlockGame(false);
        }

        return;
    },
    onMessage: async (message, cache) => {},
    onEnd: async (global, setup, game) => {
        /**
         * Runs during game end processes.
         */

        console.log("Extension End");

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {},
    onVotes: async (global, setup, game, board ) => { return ""; },
    onHammer: async (global, setup, game, hammered: string) => {},
    onRemove: async (global, setup, game, removed: string) => {}
} satisfies Extension;

async function getDaykill(id: string) {
    const db = firebaseAdmin.getFirestore();

    const data = (await db.collection('daykill').doc(id).get()).data();
    if(data == undefined) return undefined;

    return {
        type: data.type as 'mute' | 'remove',
        expire: data.expire as number,
        lock: data.lock as 'hammer' | 'pause',
        day: data.day as number,
    }
}

async function getSettings() {
    const db = firebaseAdmin.getFirestore();

    const data = (await db.collection('daykill').doc('settings').get()).data();

    let type = "mod";
    let minutes = 20;

    if(data == undefined) {
        await db.collection("daykill").doc('settings').set({
            type: "mod",
            minutes: 20,
        });
    } else {
        type = data.type;
        minutes = data.minutes;
    }

    return {
        type: type as 'mod' | 'cancel',
        minutes,
    }
}