import { Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { getGlobal } from "../utils/main";
import { z } from "zod";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

module.exports = {
    name: "Example",
    commandName: "example",
    description: "This is an example extension.",
    priority: [ "onVote" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: "help",
    commands: [
        {
            name: "list",
            arguments: {
                optional: [ z.coerce.number() ]
            }
        }
    ] satisfies CommandOptions[],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        return;

        /**
         * Nothing to return.
         */
    },
    onLock: async (global, setup, game) => {
        /**
         * Runs after game has locked.
         */
    },
    onUnlock: async (global, setup, game, incremented: boolean) => {
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
    onCommand: async (command: Command) => {
        /**
         * Text commands only for the forseeable future.
         * 
         * command: Command
         */

        console.log(command);

        return;

        /**
         * Nothing to return.
         */
    },
    onMessage: async (message: Message, cache: Cache) => {
        /*
         * Keep fetches to a minimum, these can add up. For this reason, only cache is given, only use helper functions when necessary.
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
         * Runs during game end processes.
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