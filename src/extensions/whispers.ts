import { ChannelType, Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getGameByID, getGlobal } from "../utils/main";
import { z } from "zod";
import { firebaseAdmin } from "../firebase";
import { Setup, getSetup } from "../utils/setup";
import { Signups } from "../utils/games";
import { Global } from "../utils/main";
import { User, getUser, getUserByName } from "../utils/user";
import { FieldValue } from "firebase-admin/firestore";
import { checkMod } from "../utils/mod";
import { Extension } from "../utils/extensions";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

const help = `**Player Commands**

**?whisper {name} {message}** Send a message to a player. This command can only be run within dms.

**Mod Commands**

**?whispers lock** Lock all whispers, preventing anyone from sending a whisper.

**?whispers unlock** Unlocks all whispers, allowing anyone to send a whisper (with restrictions in place).

**?whispers lock match** Matches whether whispers are locked with the main chat.

**?whispers block {send|receive|both}** Prevent a specific player from sending and/or receiving whipsers, default: both. Must be run in dms.

**?whispers unblock {send|receive|both}** Unblock a specific player from sending and/or receiving whipser, default: both. Must be run in dms.

**?whispers restrict {whitelist|blacklist} {send|receive|both} {nickname} {nickname...}** Restrict a player from sending and/or receiving whispers from certain players, must specify type of restriction. Must be run in dms. Using this command after using it once will overwrite previous restrictions. 

**?whispers unrestrict {whitelist|blocklist} {send|receive|both}** Remove all restirctions from a specific player, default: both. Must be run in dms.

**?whispers cooldown {milliseconds}** Set the cooldown for sending whispers. Run in spectator chat to change global cooldown, run in specific dm to change specific players cooldown. 

**?whispers cooldown match** Reset a specific player's cooldown to match global cooldown. Must be run in dms.

**?whispers cooldown clear** Clear a specific player's cooldown if ran in DMs, or everyone's if ran in spectator chat.

**?whispers overview** Check all settings for whispers.
`

module.exports = {
    name: "Whispers",
    emoji: "💬",
    commandName: "whispers",
    description: "Creates chats in dms between players.",
    shorthands: [{
        name: "whisper",
        to: "send",
    }],
    priority: [ ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "send",
            arguments: {}
        }
    ] satisfies CommandOptions[],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('whispers'), 20);

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global: Global, setup: Setup, game: Signups) => {


    },
    onUnlock: async (global: Global, setup: Setup, game: Signups, incremented: boolean) => {
        

    },
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        const setup = await getSetup();
        const member = await setup.primary.guild.members.fetch(command.user.id);

        checkMod(setup, command.user.id, command.message.guildId ?? "");
        
        //if(command.message.channel.type != ChannelType.GuildText || command.message.channel.guildId != setup.secondary.guild.id || command.message.channel.parentId != setup.secondary.dms.id) throw new Error("This command must be run in dead chat dms.");

        const db = firebaseAdmin.getFirestore();

        if(command.name == "send") {
            //const global = await getGlobal();
            //const game = await getGameByID(global.game ?? "");

            command.reply("hi");
        }
        
    },
    onMessage: async (message: Message, cache: Cache) => {},
    onEnd: async (global, setup, game) => {},
    onVote: async (votes: Vote[], vote: Vote ,voted: boolean, global, setup, game) => {},
    onVotes: async (voting: string[], votes: Map<string, Vote[]>, day: number, global, setup, game) => {},
    onHammer: async (global, setup, game, hammered: string) => {},
    onRemove: async (global: Global, setup: Setup, game: Signups, removed: string) => {

    },
} satisfies Extension;

function capitalize(input: string) {
    return input.substring(0, 1).toUpperCase() + input.substring(1, input.length).toLowerCase();
}

export function messageOverwrites() {
    return {
        ViewChannel: true,
        SendMessages: true,
        AddReactions: true, 
        AttachFiles: true, 
        EmbedLinks: true, 
        SendPolls: true, 
        SendVoiceMessages: true,
        UseExternalEmojis: true,
        SendTTSMessages: false,
        UseApplicationCommands: true,
    }
}

export function readOverwrites() {
    return {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false, 
        AttachFiles: false, 
        EmbedLinks: false, 
        SendPolls: false, 
        SendVoiceMessages: false,
        UseExternalEmojis: false,
        SendTTSMessages: false,
        UseApplicationCommands: false,
    }
}