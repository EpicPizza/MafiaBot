import { Message } from "discord.js";
import { Vote } from "../utils/vote";
import { Command, CommandOptions } from "../discord";
import { deleteCollection, getGlobal } from "../utils/main";
import { z } from "zod";
import { firebaseAdmin } from "../firebase";

const help = `This is the game specific extension for Gambling Mafia.

**?balance** Check your balance, cannot be run in main chat.

**?items** Check your bought items, cannot be run in main chat.

**?activated** See what items have been activated.

**?buy {item}** Buy an item that may be bought during the day. Some items may only be bought with commands in DMs.

**?use {item}** Use an item during the day. Some items may only be used with commands in DMs.

**?balance set** Mod command for setting balance.
`

module.exports = {
    name: "Gambling",
    emoji: "💸",
    commandName: ["balance", "buy", "use", "items", "activated"],
    description: "For gambling of course! Game specific extension.",
    priority: [ "onVote", "onVotes" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: help,
    commands: [
        {
            name: "list",
            arguments: {
                required: [ z.string() ],
                optional: [ z.coerce.number() ]
            }
        }
    ] satisfies CommandOptions[],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        const db = firebaseAdmin.getFirestore();

        await deleteCollection(db, db.collection('gambling'), 20);

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
    onUnlock: async (global, setup, game, incremented: boolean) => {
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

        console.log("Extension", message);

        return;

        /**
         * Nothing to return.
         */
    },
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
    onVote: async (votes: Vote[], vote: Vote ,voted: boolean, global, setup, game) => {
        /**
         * Runs after vote is counted, before vote/hammer is annouced.
         * 
         * vote: { id: string, for: string, timestamp: number }[]
         */

        console.log(vote, voted, votes);

        return { hammer: true, message: "hiiiiiii", hammered: "put an id here" };

        /**
         * hammer: boolean - Tells to hammer or not.
         * message: string | null - Message to append to vote/hammer, null will return default.
         */
    },
    onVotes: async (voting: string[], votes: Map<string, Vote[]>, day: number, global, setup, game) => {
        /**
         * Runs while processing votes command.
         * 
         * voting: string[] - array of each voted person's id
         * votes: Map<string, Vote[]> - array of votes for each voted person, key is person's id
         */

        console.log(voting, votes);
        
        return { description: "This votes counter has been overtaken by extension.", message: "" }

        /**
         * A string that will replace the votes list in votes command.
         */
    },
    onHammer: async (global, setup, game, hammered: string) => {},
    onRemove: async (global, setup, game, removed: string) => {}
}