import { Command } from "commander";
import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Event, type TextCommand } from '../../discord';
import { firebaseAdmin } from "../../utils/firebase";
import { Subcommand } from "../../utils/subcommands";
import { getRunningGames } from "../../utils/mafia/context";
import { getGameDocs } from "../../utils/mafia/gameCache";

export const InfoCommand = {
    name: "info",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("info")
        .setDescription("Show all games and their ids."),
    text: () => {
        return new Command()
            .name('info')
            .description('Show all games (active, completed and canned) and their ids.');
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const db = firebaseAdmin.getFirestore();

        const docs = await getGameDocs(interaction.instance.id);

        const running = new Set((await getRunningGames(interaction.instance)).map(game => game.game.id));

        const games = docs
            .map(doc => ({ id: doc.id, name: (doc.data().name ?? "Unnamed") as string, state: (doc.data().state ?? "unknown") as string }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const format = (game: typeof games[number]) => "**" + game.name + "** - `" + game.id + "`" + (running.has(game.id) ? " · running" : "") + (game.state != 'active' ? " · " + game.state : "");

        const active = games.filter(game => game.state == 'active').map(format);
        const inactive = games.filter(game => game.state != 'active').map(format);

        const sections = [
            ...(active.length > 0 ? ["### Active", ...active] : []),
            ...(inactive.length > 0 ? ["### Inactive", ...inactive] : []),
        ];

        // Embed descriptions cap at 4096 characters.
        let description = "";
        let shown = 0;

        for(const line of sections) {
            if(description.length + line.length + 40 > 4096) break;

            description += line + "\n";
            if(!line.startsWith("###")) shown++;
        }

        if(shown < games.length) description += "-# " + (games.length - shown) + " more not shown.";

        const embed = new EmbedBuilder()
            .setTitle("Games")
            .setColor(Colors.Orange)
            .setDescription(games.length == 0 ? "No games found." : description);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
} satisfies Subcommand;
