import { Command } from "commander";
import { ChannelType } from "discord.js";
import { Event, type TextCommand } from '../discord';
import { simpleJoin } from '../utils/text';
import { Extension, ExtensionInteraction } from "../utils/extensions";
import { firebaseAdmin } from "../utils/firebase";
import { deleteCollection } from "../utils/mafia/main";
import { getUser, getUserByChannel } from "../utils/mafia/user";
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";
import { getCommandGame } from "../utils/mafia/context";
import { gameRef } from "../utils/mafia/games";

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
        () => {
            return new Command()
                .name('set')
                .description('300 word limit will, must be set by the player before they are hammered')
                .argument('<will...>', 'will', simpleJoin);
        },
        () => {
            return new Command()
                .name('lock')
                .description('mod command for deleting will and disallowing player to set will')
        },
        () => {
            return new Command()
                .name('unlock')
                .description('mod command for allowing player to set will again if they were locked')
        }
    ],
    interactions: [],
    onStart: async (ctx) => {
        const { instance, game } = ctx;

        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, gameRef(instance, ctx.game.id).collection('wills'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (ctx) => {},
    onUnlock: async (ctx, incremented) => {},
    onCommand: async (command: Event<TextCommand>) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        
        command.inInstance();

        const ctx = await getCommandGame(command);
        const global = ctx.state;
        const setup = command.instance.setup;
        
        if(command.name == "set") {
            const user = await getUser(command.user.id, command.instance);

            if(user == undefined || !global.players.find(player => player.id == user.id)) throw new Error("You must be part of game.");

            const will = command.program.processedArgs[0] //~~maximum stupidity~~ not anymore!

            console.log(will);

            const db = firebaseAdmin.getFirestore();

            const ref = gameRef(command.instance, ctx.game.id).collection('wills').doc(user.id);

            if((await ref.get()).data()?.locked == true) throw new Error("You are not allowed to set a will.");

            await ref.set({
                will: will,
                locked: false,
            });

            await command.message.react("✅");
        } else if(command.name == "lock") {
            await checkMod(setup, command.instance.global, command.user.id, command.message.guildId ?? "");
            
            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != ctx.gameSetup.dms.id) throw new Error("This command must be run in dead chat dms.");

            const player = await getUserByChannel(command.message.channelId, command.instance);

            if(player == undefined) throw new Error("User not found.");

            const db = firebaseAdmin.getFirestore();

            const ref = gameRef(command.instance, ctx.game.id).collection('wills').doc(player.id);

            await ref.update({
                will: "",
                locked: true,
            });

            await command.message.react("✅");
        } else {
            await checkMod(setup, command.instance.global, command.user.id, command.message.guildId ?? "");

            if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != ctx.gameSetup.dms.id) throw new Error("This command must be run in dead chat dms.");

            const player = await getUserByChannel(command.message.channelId, command.instance);

            if(player == undefined) throw new Error("User not found.");

            const db = firebaseAdmin.getFirestore();

            const ref = gameRef(command.instance, ctx.game.id).collection('wills').doc(player.id);

            await ref.delete();

            await command.message.react("✅");
        }

        /**
         * Nothing to return.
         */
    },
    onInteraction: async (extensionInteraction: ExtensionInteraction) => {},
    onMessage: async (message) => {},
    onEnd: async (ctx) => {},
    onVote: async (ctx, voter, voting, type, users, transaction) => {},
    onVotes: async (ctx, board ) => {
        const { instance, game } = ctx;
 return ""; },
    onHammer: async (ctx, hammered) => {
        const { instance, game } = ctx;

        const user = await getUser(hammered, instance);

        if(!user) return;

        const db = firebaseAdmin.getFirestore();

        const ref = gameRef(instance, ctx.game.id).collection('wills').doc(user.id);

        const data = (await ref.get()).data();

        console.log(data);

        if(!data || data.locked == true) return;
        
        await wait(1000);        

        const message = await ctx.gameSetup.main.send(".");

        await wait(2000);

        await message.edit("..");

        await wait(2000);

        await message.edit("...");

        await wait(2000);

        await message.edit("*\"" + data.will + "\"* - " + user.nickname);

        await wait(5000);
    },
    onRemove: async (ctx, removed: string) => {},
    onDump: async (statsBatch, messageBatch, reactionBatch) => {},
} satisfies Extension;

async function wait(milliseconds: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, milliseconds);
    })
}