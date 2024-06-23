import { Message } from "discord.js";
import { Vote } from "../utils/vote";
import { CommandOptions } from "../utils/commands";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

module.exports = {
    name: "Example",
    onInit: async () => {
        /**
         * Where you will be returning the commands used by extension so the bot can parse them properly.
         */

        return [] satisfies CommandOptions[];

        /**
         * CommandOptions: { name: string, arguments: ZodObject[] } - The zod object will how the bot parses strings, numbers, or booleans.
         */
    },
    onStarting: async () => {
        /**
         * Runs after the game is starting message.
         */

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async () => {
        /**
         * Runs after game has locked.
         */
    },
    onUnlock: async (incremented: boolean) => {
        /**
         * Runa after game has unlocked.
         * 
         * incremented: boolean - Whether day has advanced or not.
         */

        return;

        /**
         * Nothing to return.
         */
    },
    onCommand: async () => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: { name: string, arguments: (string | number, boolean)[] } - Text Commands Only
         */

        return;

        /**
         * Nothing to return.
         */
    },
    onMessage: async (message: Message, cache: Cache) => {
        /*
         * Keep fetches to a minimum, these can add up.
         * 
         * cache: { day: number, started: boolean, channel: null | TextChannel } - TextChannel may or may not be fetched depending if bot has fully intialized
         */

        return;

        /**
         * Nothing to return.
         */
    },
    onEnd: async (message: Message) => {
        /**
         * Runs durring game end processes.
         */

        return;

        /**
         * Nothing to return.
         */
    },
    onVote: async (votes: Vote[], vote: Vote) => {
        /**
         * Runs after vote is counted, before vote/hammer is annouced.
         * 
         * vote: { id: string, for: string, timestamp: number }[]
         */

        return { hammer: false, message: null };

        /**
         * hammer: boolean - Tells to hammer or not.
         * message: string | null - Message to append to vote/hammer, null will return default.
         */
    }
}