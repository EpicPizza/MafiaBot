import { ActionRow, ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, CommandInteraction, EmbedBuilder, Message, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder } from "discord.js";
import { Data } from "../discord";
import { z } from "zod";
import { getSetup } from "../utils/setup";
import { getGlobal } from "../utils/main";
import { Command } from "../discord";
import { getEnabledExtensions } from "../utils/extensions";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-help',
            command: new SlashCommandBuilder()
                .setName('help')
                .setDescription('How to use Mafia Bot and its commands.')
        },
        {
            type: 'select',
            name: 'select-help',
            command: z.object({
                name: z.literal("help"),
                id: z.string(),
            })
        },
        {
            type: 'text',
            name: 'text-help',
            command: {}
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | Command ) => {
        const global = await getGlobal();

        const extensions = await getEnabledExtensions(global);
        
        const embed = new EmbedBuilder()
            .setTitle("Mafia Bot Help")
            .setColor(Colors.Green)
            .setDescription(help);

        const page = interaction.type != 'text' && interaction.isStringSelectMenu() ? interaction.values[0] : "0";

        const select = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents([
                new StringSelectMenuBuilder()
                    .setCustomId(JSON.stringify({ name: "help", id: interaction.user.id }))
                    .addOptions([
                        new StringSelectMenuOptionBuilder()
                            .setLabel("Home")
                            .setDescription("Home for help command.")
                            .setEmoji("🏠")
                            .setDefault(page == "0")
                            .setValue("0"),
                        new StringSelectMenuOptionBuilder()
                            .setLabel("Player Commands")
                            .setDescription("Commands for playing the game, joining games, etc.")
                            .setEmoji("🔪")
                            .setDefault(page == "1" || page == "2")
                            .setValue((global.started ? 1 : 2).toString()),
                        new StringSelectMenuOptionBuilder()
                            .setLabel("Mod Commands")
                            .setDescription("Commands for creating games, adding spectators, running games, etc.")
                            .setEmoji("📡")
                            .setDefault(page == "3" || page == "4" || page == "6")
                            .setValue((global.started ? 3 : 4).toString()),
                        new StringSelectMenuOptionBuilder()
                            .setLabel("Setup Commands")
                            .setDescription("Commands for setting up the bot and troubleshooting.")
                            .setEmoji("🛠️")
                            .setDefault(page == "5")
                            .setValue("5"),
                        ...extensions.map(
                            extension => 
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(extension.name + " Extension")
                                    .setDescription(extension.description)
                                    .setEmoji(extension.emoji)
                                    .setDefault(page == extension.name)
                                    .setValue(extension.name),
                        )
                    ])
            ]);
        
        if(interaction.type == 'text') {
         

            await interaction.reply({ embeds: [embed], components: [select] });
        } else if(interaction.isChatInputCommand()) {
            await interaction.reply({ embeds: [embed], components: [select] });
        } else if(interaction.isStringSelectMenu()) {
            const command = JSON.parse(interaction.customId);

            if(command.id != interaction.user.id) return await interaction.reply({ ephemeral: true, content: "This is not your button! Run the /help command yourself." });

            if(page == "0") {
                await interaction.update({ embeds: [embed], components: [select] });
            } else if(page == "1") {
                const embed = new EmbedBuilder()
                    .setTitle("Mafia Bot Help » Player Commands")
                    .setColor(Colors.Orange)
                    .setDescription(playerCommandsInGame);   

                const additionalSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents([
                        new StringSelectMenuBuilder()
                            .setCustomId(JSON.stringify({ name: "help", type: "sub", id: interaction.user.id }))
                            .addOptions([
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("In-Game Commands")
                                    .setDescription("Commands for playing the game.")
                                    .setEmoji("🎮")
                                    .setDefault()
                                    .setValue("1"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Pre-Game Commands")
                                    .setDescription("Commands for joining games, changing nickname, etc.")
                                    .setEmoji("📝")
                                    .setValue("2"),
                            ])
                    ])

                await interaction.update({ embeds: [embed], components: [additionalSelect, select] })
            } else if(page == "2") {
                const embed = new EmbedBuilder()
                    .setTitle("Mafia Bot Help » Player Commands")
                    .setColor(Colors.Orange)
                    .setDescription(playerCommandsPreGame);   

                const additionalSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents([
                        new StringSelectMenuBuilder()
                            .setCustomId(JSON.stringify({ name: "help", type: "sub", id: interaction.user.id }))
                            .addOptions([
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("In-Game Commands")
                                    .setDescription("Commands for playing the game.")
                                    .setEmoji("🎮")
                                    .setValue("1"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Pre-Game Commands")
                                    .setDescription("Commands for joining games, changing nickname, etc.")
                                    .setEmoji("📝")
                                    .setDefault()
                                    .setValue("2"),
                            ])
                    ])

                await interaction.update({ embeds: [embed], components: [additionalSelect, select] })
            } else if(page == "3") {
                const embed = new EmbedBuilder()
                    .setTitle("Mafia Bot Help » Mod Commands")
                    .setColor(Colors.Red)
                    .setDescription(modCommandsInGame);   

                const additionalSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents([
                        new StringSelectMenuBuilder()
                            .setCustomId(JSON.stringify({ name: "help", type: "sub", id: interaction.user.id }))
                            .addOptions([
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("In-Game Commands")
                                    .setDescription("Commands for running the game.")
                                    .setEmoji("👷‍♂️")
                                    .setDefault()
                                    .setValue("3"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Pre-Game/Post-Game Commands")
                                    .setDescription("Commands for creating games, archiving games, etc.")
                                    .setEmoji("📝")
                                    .setValue("4"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Extension Commands")
                                    .setDescription("Commands for enabling and disabling extensions.")
                                    .setEmoji("🔌")
                                    .setValue("6"),
                            ])
                    ])

                await interaction.update({ embeds: [embed], components: [additionalSelect, select] })
            } else if(page == "4") {
                const embed = new EmbedBuilder()
                    .setTitle("Mafia Bot Help » Mod Commands")
                    .setColor(Colors.Red)
                    .setDescription(modCommandsPreGame);   

                const additionalSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents([
                        new StringSelectMenuBuilder()
                            .setCustomId(JSON.stringify({ name: "help", type: "sub", id: interaction.user.id }))
                            .addOptions([
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("In-Game Commands")
                                    .setDescription("Commands for running the game.")
                                    .setEmoji("👷‍♂️")
                                    .setValue("3"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Pre-Game/Post-Game Commands")
                                    .setDescription("Commands for creating games, archiving games, etc.")
                                    .setEmoji("📝")
                                    .setDefault()
                                    .setValue("4"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Extension Commands")
                                    .setDescription("Commands for enabling and disabling extensions.")
                                    .setEmoji("🔌")
                                    .setValue("6"),
                            ])
                    ])

                await interaction.update({ embeds: [embed], components: [additionalSelect, select] })
            } else if(page == "5") {
                const embed = new EmbedBuilder()
                    .setTitle("Mafia Bot Help » Setup Commands")
                    .setColor(Colors.Yellow)
                    .setDescription(setupCommands);

                await interaction.update({ embeds: [embed], components: [select] })
            } else if(page == "6") {
                const embed = new EmbedBuilder()
                    .setTitle("Mafia Bot Help » Mod Commands")
                    .setColor(Colors.Red)
                    .setDescription(extensionsCommands);

                 const additionalSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents([
                        new StringSelectMenuBuilder()
                            .setCustomId(JSON.stringify({ name: "help", type: "sub", id: interaction.user.id }))
                            .addOptions([
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("In-Game Commands")
                                    .setDescription("Commands for running the game.")
                                    .setEmoji("👷‍♂️")
                                    .setValue("3"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Pre-Game/Post-Game Commands")
                                    .setDescription("Commands for creating games, archiving games, etc.")
                                    .setEmoji("📝")
                                    .setValue("4"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Extension Commands")
                                    .setDescription("Commands for enabling and disabling extensions.")
                                    .setEmoji("🔌")
                                    .setDefault()
                                    .setValue("6"),
                            ])
                    ])

                await interaction.update({ embeds: [embed], components: [additionalSelect, select] })
            } else {
                const extension = extensions.find(extension => extension.name == page);

                if(extension == undefined) {
                    throw new Error("Extension not found.");
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle("Mafia Bot Help » " + extension.name + " Extension")
                        .setColor(Colors.Purple)
                        .setDescription(extension.help);

                    await interaction.update({ embeds: [embed], components: [select] });
                }
            }
        }
    }
}

const help = `This bot is primarly used through slash commands.  Each category of commands is listed below. Note: setup commands (⚒️) are admin only.

----------***How to Play***----------

1. Signup for a game with the signup button.
2. Wait for mod to start the game to get mafia server invite.
3. Follow instructions by mod in dms.
4. Use player commands to play 👍.`

const playerCommandsInGame = `**/players or ?players {game} {complete}** View remaining players of current mafia game (specify game name to view original signups). Complete option will also give all @.

**/votes or ?votes {day}** View current votes (and specify day to view votes from that day).

**/stats or ?stats {day}** View message and word count for each player (and specify day to view stats from that day).

**/vote or ?vote {name}** Vote for a player. Specify the same player to remove your vote, or a new player to change your vote.

**/unvote or ?unvote** Remove your vote.

**Snipe or ?snipe (reply to message)** Check edits for a message. Can be accessed in the apps section of message options.`;

const playerCommandsPreGame = `**/nickname or ?nickname** Add/edit your nickname. You'll be also asked to add a nickname on signup if you're a new player.

**/info or ?info {nickname or @member}** Check the nickname or @ of a player with their nickname or @.

**/signup or ?signup {game}** Signup for a game with the game name.

**/leave or ?leave {game}** Remove signup for a game with the game name.

**/players or ?players {game} {complete}** Specify game name to view signups for a game. Complete option will also give all @.`

const modCommandsPreGame =`**/games or ?games** See all games currently happening.

**/mod create or ?mod create {name}** Creates a new game. Also makes spectator and mafia channels for that game.

**/mod signups or ?mod signups {name}** Creates signups for a new game. You can only have one signup button for each game, old buttons can be reactivated however.

**/mod close or ?mod close {name}** Closes signups for a game.

**/mod open or ?mod open {name}** Reopens signups for a game whose signups have been closed.

**/mod kick or ?mod kick {nickname} {game}** Kicks a player from signups.

**/mod spectator or ?mod spectator {@member}** Invites a spectator to dead and mafia server to spectate.

**/mod archive or ?mod archive {name}** Removes the game from database and moves channels to archived category.`

const modCommandsInGame = `**/mod start or ?mod start {name}** Starts the game. Locks the channel. Setups player dms. Kicks everyone from mafia server. Sends message in spectator chat to setup allignments (which will invite mafia to mafia server after confirming).

**/mod unlock or ?mod unlock** Unlocks the game, and asks if you want to advance day.

**/mod lock or ?mod lock** Locks the game.

**/mod remove or ?mod remove {nickname}** Removes a player from the game. Gives them access to spectator channel and removes their alive role.

**/mod end or ?mod end** Ends the game. Gives spectator perms to everyone, and invites to mafia server if they are not already in mafia server.`

const setupCommands = `**/setup mod** Gives mod roles in all three servers. Also gives invites to mafia and dead server if they are not already in those servers. 

**/setup check** Checks all linked roles, channels, and channel categories.

**/setup database** Sets up the databse (or resets it if already setup, so DO NOT RUN IF GAME HAS ALREADY STARTED).

**/setup permissions** Refreshes permissions in main channel.

**/setup refresh** Refreshes signups for a game.
`

const extensionsCommands = `Extensions allow for added features or edited bot functionality. Mods can manage extensions before a game starts. Extensions currently only support text commands.

**/mod extension list or ?mod extension list** - List all extensions and whther they are enabled or disabled.

**/mod extension enable {extension} or ?mod extension enable {extension}** - Enable an extension. Some extensions cannot be enabled at the same time if they modify the same bot behavior.

**/mod extension disable {extension} or ?mod extension disable {extension}** - Disable an extension.
`