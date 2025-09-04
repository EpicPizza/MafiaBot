# Discord.js Bot Template

This is a template for a `discord.js` bot that includes handlers for slash commands, text commands, reaction commands, and other interactions.

## Setup

1.  Clone this repository.
2.  Run `npm install` to install the dependencies.
3.  Create a `.env` file in the root directory and add your bot's token and client ID:

    ```
    TOKEN=your_bot_token_here
    CLIENT_ID=your_client_id_here
    ```

4.  Run `npm run build` to compile the TypeScript code.
5.  Run `npm start` to start the bot.
6.  To run the bot in development mode, use `npm run dev`. This will use `nodemon` to automatically restart the bot when you make changes to the code.

## Registering Slash Commands

Before your slash commands will appear in Discord, you need to register them with Discord's API.

1.  Make sure you have added your `CLIENT_ID` to your `.env` file.
2.  Run the following command:

    ```bash
    npm run register
    ```

    You only need to run this command when you add or change a slash command.

## Creating Commands

To create a new command, create a new file in the `src/commands` directory. The file must export a `data` array and an `execute` function.

The `data` array can contain multiple command definitions. Each command definition is an object with a `type` property that determines the type of command.

### Slash Commands

```typescript
import { SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";

export const data: Data[] = [
    {
        type: 'slash',
        name: 'ping',
        command: new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Replies with Pong!'),
    }
]

export async function execute(interaction: any) {
    await interaction.reply('Pong!');
}
```

### Text Commands

Text commands are triggered by messages that start with `?`.

```typescript
import { Command } from "commander";
import { Data } from "../discord";

export const data: Data[] = [
    {
        type: 'text',
        name: 'ping',
        command: () => new Command('ping').description('Replies with Pong!'),
    }
]

export async function execute(interaction: any) {
    await interaction.reply('Pong!');
}
```

#### Subcommands

You can also add subcommands to your text commands.

```typescript
import { Command } from "commander";
import { Data, TextCommand } from "../discord";

export const data: Data[] = [
    {
        type: 'text',
        name: 'ping',
        command: () => {
            const command = new Command('ping');
            command.description('Replies with Pong!');
            command.action(() => { });

            const subcommand = new Command('foo');
            subcommand.description('Replies with Bar!');
            subcommand.action(() => { });

            command.addCommand(subcommand);
            return command;
        },
    }
]

export async function execute(interaction: TextCommand | any) {
    if (interaction.type === 'text') {
        const subcommand = interaction.program.args[0];
        if (subcommand === 'foo') {
            await interaction.reply('Bar!');
        } else {
            await interaction.reply('Pong!');
        }
    } else {
        await interaction.reply('Pong!');
    }
}
```

### Reaction Commands

Reaction commands are triggered when a user reacts to a message with a specific emoji.

```typescript
import { Data } from "../discord";

export const data: Data[] = [
    {
        type: 'reaction',
        name: 'ping',
        command: '🏓',
    }
]

export async function execute(interaction: any) {
    await interaction.reply('Pong!');
}
```

### Other Interactions

You can also handle other interactions like buttons, modals, and select menus. See `src/discord/interaction.ts` for more details.
