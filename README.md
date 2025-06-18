# Mafia Bot

This bot is made using discord.js library and typescript. Unless someone else recommends another database, I will be using Firebase since it is free and I know how to use it.

## Production

~~Not sure where I will running the bot, Heroku is kinda expensive now.~~ Heroku easy to use and somehow cheaper than google cloud.

## Commands

| Command                   | Action                                                 |
| :------------------------ | :------------------------------------------------------|
| `npm install`             | Installs dependencies                                  |
| `npm run dev`             | Updates commands on dev and starts the local bot.      |
| `npm run build`           | Build the production bot to `./build/`                 |
| `npm run prod`            | Updates commands on prod and runs the production bot.  |

## .env

| Value                     | Description                                            |
| :------------------------ | :------------------------------------------------------|
| `DEV`                     | Either TRUE or FALSE, signifies if running on dev.     |
| `DEVTOKEN`                | Token for development bot.                             |
| `DEVCLIENT`               | Client id of development bot.                          |
| `DEVGUILD`                | Guild id of server development bot is in.              |
| `FIREBASE_ADMIN`          | Key for firebase admin.                                |

## Database

Once you've added firebase admin credentials, run the /setup database command then fill out all null values in settings > setup. Use /setup check to check which values are missing.

## Project Struture

- Commands: Slash, text, modal, button, context, select, reactions command files.
- Utils: Common functions used throughout Mafia Bot.
- Extensions: Additional game mechanics and bot functions meant to be easily disabled and not clutter main code.

Top Files

- archive.ts - idk why it's still here, prob fits better in utils
- disable.ts - to disable discord bot while just registering commands
- discord.ts - the main file, has command handlers and related event handlers
- firebase.ts - Firebase Admin setup
- register.ts - command registering file
- setup.ts - the file thats get called to register commands, first disabling bot and then calling the real register file

## Utils

- extension.ts - Reads extensions in /extensions
- games.ts - Handles game-by-game functions (creating, archiving, signups, etc).
- main.ts - Handles active game functions (locking, start, end, permissions, invites, days, etc)
- mod.ts - just functions for checking mod
- setup.ts - functions for fetching channels, servers, roles that always stay the same game to game
- timing.ts - grace/lock scheduling functions
- tracking.ts - functions for stats
- user.ts - functions for fetching users
- vote.ts - functions for fetching/setting votes

## Commands

I think you get the point by now, I'll just cover quirks now:

### Command Structure

Here is the exact type for a command:

`export type Data = ({
    type: 'button',
    name: string,
    command: ZodObject<any>,
} | {
    type: 'slash',
    name: string,
    command: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | Function,
} | {
    type: 'context',
    name: string,
    command: ContextMenuCommandBuilder,
} | {
    type: 'modal',
    name: string,
    command: ZodObject<any>,
} | {
    type: 'select',
    name: string,
    command: ZodObject<any>,
} | {
    type: 'text',
    description?: string,
    name: string,
    command: TextCommandArguments,
} | {
    type: 'reaction',
    name: string,
    command: string,
});`

The command type always prefixes to the actual name, so its slash-vote, text-help, context-Delete, etc. I know it's kinda bad practice to do that, but whatever.

There can be multiple commands, and of different types, that get executed by the same function. This makes it super easy to add alias commands or commands that can easily be run in the same context, most commonly for text/slash commands.

This makes for cases like the vote command, which is actually a group of 5 individual commands.

### Text commands

For declaring arguments, there are required and optional arguments. Required always go before optional, and they always go in order. You can't have the second optional argument without having the first optional argument. These arguments are declared with zod and are parsed automatically, so you just need to check the type.

Example:

`text: {
    required: [ z.string().regex(/^<@\d+>$/) ]
} satisfies TextCommandArguments` 
from ./commands/mod/invite.ts

### Interactions with customId

The format of the customId is standardized throughout the bot. It is JSON containing the name and then any other needed arguments. Gets automatically parsed but the main button handler.

Example

`command: z.object({
    name: z.literal('reactivate'),
    game: z.string().min(1).max(100)
}),`
from ./commands/mod/signups.ts

### Subcommands

Generally straightforward for slash commands, uses the subcommand builder as usual and the main subcommand file in the subcommand directory handles finding the right execution.

./mod.ts - intializes top command and handles top execution
./mod/mod.ts - reads all the subcommands and then finds subcommand to execute
./mod/command.ts - subcommand declarations/functions

For text commands, it is essentially a complete copy of the top text command handler, the only quirk with this is that arguments[0] is the subcommand name, so it starts from arguments[1].

### Extension Commands

Honestly, I would probably rewrite subcommands to how extension commands work. There can only be text commands for extensions. They are handled alongside all other text commands (no seperate command handling). The bo looks for the extension prefix (commandName), and then runs the command as any other command, but with the additional name field to differientiate. Arguments start normally at index 0 unlike subcommands. 

Notes:

- By declaring commandName as an array with all the individual command names, you remove the extension command prefix. Look at ./extensions/gambling.ts
- Shorthands: useful for declaring one individual command without extension prefix, { name: the command name to be called by, to: which command to point to within the extension }. Look at ./extensions/whispers.ts