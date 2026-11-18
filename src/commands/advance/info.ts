import { Command } from "commander";
import { ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { Event, type TextCommand } from '../../discord';
import { firebaseAdmin } from "../../utils/firebase";
import { Subcommand } from "../../utils/subcommands";

export const InfoCommand = {
    name: "info",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("info")
        .setDescription("Show games and their ids.")
        .addBooleanOption(option =>
            option
                .setName("all")
                .setDescription("Include completed and canned games.")
                .setRequired(false)
        ),
    text: () => {
        return new Command()
            .name('info')
            .description('Show active games and their ids. Use --all to include completed and canned games.')
            .option('-a, --all', 'include completed and canned games');
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const all = interaction.type == 'text' ? interaction.program.getOptionValue('all') === true : interaction.options.getBoolean('all') === true;

        const db = firebaseAdmin.getFirestore();

        let query = db.collection('instances').doc(interaction.instance.id).collection('games') as FirebaseFirestore.Query;
        if(!all) query = query.where('state', '==', 'active');

        const docs = (await query.get()).docs;

        const running = interaction.instance.global.game;

        const lines = docs
            .map(doc => ({ id: doc.id, name: (doc.data().name ?? "Unnamed") as string, state: (doc.data().state ?? "unknown") as string }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(game => "**" + game.name + "** - `" + game.id + "`" + (all ? " · " + game.state : "") + (game.id == running ? " · running" : ""));

        // Embed descriptions cap at 4096 characters.
        let description = "";
        let shown = 0;

        for(const line of lines) {
            if(description.length + line.length + 40 > 4096) break;

            description += line + "\n";
            shown++;
        }

        if(shown < lines.length) description += "-# " + (lines.length - shown) + " more not shown.";

        const embed = new EmbedBuilder()
            .setTitle(all ? "All Games" : "Active Games")
            .setColor(Colors.Orange)
            .setDescription(lines.length == 0 ? "No games found." : description);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
} satisfies Subcommand;
