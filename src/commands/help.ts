import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Data } from "../discord";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-help',
            command: new SlashCommandBuilder()
                .setName('help')
                .setDescription('How to use Mafia Bot and its commands.')
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction ) => {
        const embed = new EmbedBuilder()
            .setTitle("Mafia Bot Help")
            .setColor(Colors.Green)
            .setDescription(help)

        await interaction.reply({ embeds: [embed] })
    }
}

const help = `----------***How to Play***----------

1. Signup for a game with the signup button.
2. Wait for mod to start the game to get mafia server invite.
3. Follow instructions by mod in dms.
4. Use player commands to play 👍.

----------***Player Commands***----------

**/game players** View remaining players of current mafia game (specify game name to view original signups). Complete option will also give all @.

**/game votes** View current votes (and specify day to view votes from that day).

**/game stats** View message and word count for each player (and specify day to view stats from that day).

**/vote** Vote for a player. Specify the same player to remove your vote, or a new player to change your vote.

**Snipe** Check edits for a message. Can be accessed in the apps section of message options.

----------***Pre-Game Commands***----------

**/player nickname** Add/edit your nickname. You'll be also asked to add a nickname on signup if you're a new player.

**/player info** Check the nickname or @ of a player with their nickname or @.

**/game signup** Signup for a game with the game name.

**/game leave** Remove signup for a game with the game name.

**/game players** Specify game name to view signups for a game.

----------***Mod Pre-Game/Post-Game Commands***----------

**/mod create** Creates a new game. Also makes spectator and mafia channels for that game.

**/mod signups** Creates signups for a new game. You can only have one signup button for each game, old buttons can be reactivated however.

**/mod close** Closes signups for a game.

**/mod open** Reopens signups for a game whose signups have been closed.

**/mod kick** Kicks a player from signups.

**/mod spectator** Invites a spectator to dead and mafia server to spectate.

**/mod archive** Removes the game from database and moves channels to archived category.

----------***Mod In-Game Commands***----------

**/mod start** Starts the game. Locks the channel. Setups player dms. Kicks everyone from mafia server. Sends message in spectator chat to setup allignments (which will invite mafia to mafia server after confirming).

**/mod unlock** Unlocks the game, and asks if you want to advance day.

**/mod lock** Locks the game.

**/remove** Removes a player from the game. Gives them access to spectator channel and removes their alive role.

**/mod end** Ends the game. Gives spectator perms to everyone, and invites to mafia server if they are not already in mafia server.

----------***Setup Commands***----------

**/setup mod** Gives mod roles in all three servers. Also gives invites to mafia and dead server if they are not already in those servers. 

**/setup check** Checks all linked roles, channels, and channel categories.

**/setup database** Sets up the databse (or resets it if already setup, so DO NOT RUN IF GAME HAS ALREADY STARTED).

**/setup players** Refreshes player options in /vote and /remove commands.

**/setup permissions** Refreshes permissions in main channel.

**/setup refresh** Refreshes signups for a game.
`