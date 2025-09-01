import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { z } from "zod";
import { type TextCommand } from '../../discord';
import { fromZod } from '../../utils/text';
import { removeReactions } from "../../discord/helpers";
import { getEnabledExtensions } from "../../utils/extensions";
import { getGlobal, type Global } from '../../utils/global';
import { getGameByID, getGameSetup, Signups } from "../../utils/mafia/games";
import { getUser, User } from "../../utils/mafia/user";
import { getSetup, Setup, } from "../../utils/setup";
import { Subcommand } from "../../utils/subcommands";
import { addMafiaPlayer } from "../mod/alignments";

export const MafiaCommand = {
    name: "mafia",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("mafia")
        .setDescription("Add an additional mafia player.")
        .addStringOption(option =>
            option
                .setName("player")
                .setDescription("Which player to add to mafia.")
                .setRequired(true)
                .setAutocomplete(true)),
    text: () => {
        return new Command()
            .name('mafia')
            .description('add an additional mafia player')
            .argument('<player>', 'which player', fromZod(z.string().min(1).max(100)));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }
       
        const global = await getGlobal();
        const setup  = await getSetup();
        
        if(global.started == false) throw new Error("Game has not started.");

        const game = await getGameByID(global.game ?? "");
         const gameSetup = await getGameSetup(game, setup);

        const player = interaction.type == 'text' ? interaction.program.processedArgs[0] as string : interaction.options.getString('player');

        if(player == null) throw new Error("Choose a player.");

        const list = [] as User[];
        
        for(let i = 0; i < global.players.length; i++) {
            const user = await getUser(global.players[i].id);

            if(user == null) throw new Error("User not registered.");

            list.push(user);
        }

        const user = list.find(user => user.nickname.toLowerCase() == player.toLowerCase());

        if(!user) throw new Error("Player not found.");

        await addMafiaPlayer({ id: user.id, alignment: null }, setup);

        const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia, { unique: true });

        await gameSetup.spec.send("<@" + interaction.user.id + "> Here is the invite link for mafia server: \nhttps://discord.com/invite/" + invite.code);

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Mafia added."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;

async function hammerExtensions(global: Global, setup: Setup, game: Signups, hammered: string) {
    const extensions = await getEnabledExtensions(global);

    const promises = [] as Promise<any>[];

    extensions.forEach(extension => { promises.push(extension.onHammer(global, setup, game, hammered)) });

    const results = await Promise.allSettled(promises);

    const fails = results.filter(result => result.status == "rejected");

    if(fails.length > 0) {
        console.log(fails);

        throw new Error(fails.reduce<string>((accum, current) => accum + (current as unknown as PromiseRejectedResult).reason + "\n", ""));
    }
}