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

const help = `A simple extension that allows players to give a will that the bot will send after they are hammered.

**?will set {will}** 300 word limit will. Must be set by the player before they are hammered.

**?will lock** Mod command for deleting will and disallowing player to set will.

**?will unlock** Mod command for allowing player to set will again if they were locked.

**Additional Notes:** Wills will not be sent if there is not a hammer.
`

module.exports = {
    name: "Wills",
    emoji: "🪦",
    commandName: "will",
    description: "Set a will for when you're hammered.",
    priority: [ ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "set",
            arguments: {
                required: [ z.string().min(1).max(100) ],
                optional: Array(299).fill(z.string().min(1).max(100)) //maximum stupidity
            }
        },
        {
            name: "lock",
            arguments: {},
        },
        {
            name: "unlock",
            arguments: {},
        }
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

        const setup = await getSetup();
        const global = await getGlobal();
        
        if(command.name == "set") {
            const user = await getUser(command.user.id);

            if(user == undefined || !global.players.find(player => player.id == user.id)) throw new Error("You must be part of game.");

            const will = command.arguments.join(" "); //maximum stupidity

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('wills').doc(user.id);

            if((await ref.get()).data()?.locked == true) throw new Error("You are not allowed to set a will.");

            await ref.set({
                will: will,
                locked: false,
            });

            await command.message.react("✅");
        } else if(command.name == "lock") {
            checkMod(setup, command.user.id, command.message.guildId ?? "");
            
            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

            const player = await getUserByChannel(command.message.channelId);

            if(player == undefined) throw new Error("User not found.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('wills').doc(player.id);

            await ref.update({
                will: "",
                locked: true,
            });

            await command.message.react("✅");
        } else {
            checkMod(setup, command.user.id, command.message.guildId ?? "");

            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

            const player = await getUserByChannel(command.message.channelId);

            if(player == undefined) throw new Error("User not found.");

            const db = firebaseAdmin.getFirestore();

            const ref = db.collection('wills').doc(player.id);

            await ref.delete();

            await command.message.react("✅");
        }

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message: Message, cache: Cache) => {},
    onEnd: async (global, setup, game) => {},
    onVote: async (votes: Vote[], vote: Vote ,voted: boolean, global, setup, game) => {},
    onVotes: async (voting: string[], votes: Map<string, Vote[]>, day: number, global, setup, game) => {},
    onHammer: async (global: Global, setup: Setup, game, hammered: string) => {
        const user = await getUser(hammered);

        if(!user) return;

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('wills').doc(user.id);

        const data = (await ref.get()).data();

        console.log(data);

        if(!data || data.locked == true) return;
        
        await wait(1000);        

        const message = await setup.primary.chat.send(".");

        await wait(2000);

        await message.edit("..");

        await wait(2000);

        await message.edit("...");

        await wait(2000);

        await message.edit("*\"" + data.will + "\"* - " + user.nickname);

        await wait(5000);
    },
    onRemove: async (global, setup, game, removed: string) => {}
} satisfies Extension;

async function wait(milliseconds: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, milliseconds);
    })
}