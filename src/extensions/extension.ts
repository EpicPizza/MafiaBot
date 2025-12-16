import { Command } from "commander";
import { z } from "zod";
import { fromZod } from '../utils/text';
import { Extension } from "../utils/extensions";
import { flow } from "../utils/mafia/vote";

//Note: Errors are handled by bot, you can throw anywhere and the bot will put it in an ephemeral reply or message where applicable.

module.exports = {
    name: "Example",
    emoji: "📕",
    commandName: "example",
    description: "This is an example extension.",
    priority: [ "onVote", "onVotes" ], //events that need a return can only have one extensions modifying it, this prevents multiple extensions from modifying the same event
    help: "help",
    commands: [
        () => {
            return new Command()
                .name('list')
                .description('list something')
                .argument('<string>', 'a string')
                .argument('<number>', 'a number', fromZod(z.coerce.number()));
        }
    ],
    interactions: [],
    onStart: async (global, setup, game) => {
        /**
         * Runs during game start processes.
         */

        console.log("Extension Start");

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
    onCommand: async (command) => {
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
    onInteraction: async (extensionInteraction) => {
        /**
         * Interactions for buttons, modals, and select menus. Context menu and slash commands not implemented.
         * 
         *  interaction: {
         *      customId: any,
         *      name: string,
         *      interaction: ButtonInteraction | ModalSubmitInteraction | AnySelectMenuInteraction
         *  }
         */

        console.log(extensionInteraction);

        return;
    },
    onMessage: async (message) => {
        /*
         * Keep fetches to a minimum, these can add up. For this reason, only cache is given, only use helper functions when necessary.
         * 
         * cache: { day: number, started: boolean, channel: null | TextChannel } - TextChannel may or may not be fetched depending if bot has fully intialized
         */

        //console.log("Extension", message);

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
    onVote: async (global, setup, game, voter, voting, type, users, transaction) => {
        /**
         * Control the entire voting logic. This example shows the default voting behavior.
         * 
         * This runs within a database transaction, reading with the transaction blocks other writes, only read with transaction as necessary. Use users or fallback to normal reads.
         */

        const { reply, vote, votes } = await flow.placeVote(transaction, voter, voting, type, users, global.day); // doesn't save vote yet since board needs to be created
        
        if(vote == undefined) return { reply };

        const board = flow.board(votes, users);

        const setMessage = flow.finish(transaction, vote, board, global.day); // locks in vote

        return {
            reply,
            hammer: flow.determineHammer(vote, votes, users, global),
            setMessage,
        }

        /**
         * reply: { typed: string, emoji: string } - What gets replied to the user. Typed for slash/context/etc commands, emoji for text commands.
         * hammer?: { message: string, hammered: boolean, id: string } 
         * setMessage?: (id: string) => Promise<void> - Setting the id of the message to keep in logs.
         */
    },
    onVotes: async (global, setup, game, board ) => { 
        return "Example footer.";

        /**
         * Return what is show in the footer in ?votes.
         */
    },
    onHammer: async (global, setup, game, hammered) => {},
    onRemove: async (global, setup, game, removed) => {}
} satisfies Extension;