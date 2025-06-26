import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { Command, removeReactions, TextCommandArguments } from "../../discord";
import { z } from "zod";
import { getGameByID, getGlobal, lockGame } from "../../utils/main";
import { getSetup, Setup, } from "../../utils/setup";
import { getGameSetup, Signups } from "../../utils/games";
import { getUser, User } from "../../utils/user";
import { getEnabledExtensions } from "../../utils/extensions";
import { Global } from "../../utils/main";
import { addMafiaPlayer } from "../mod/alignments";

export const MafiaCommand = {
    name: "mafia",
    description: "?adv mafia {nickname}",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("mafia")
            .setDescription("Add an additional mafia player.")
            .addStringOption(option =>
                option
                    .setName("player")
                    .setDescription("Which player to add to mafia.")
                    .setRequired(true)
                    .setAutocomplete(true)),
        text: {
            required: [ z.string() ],
            optional: []
        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
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

        const player = interaction.type == 'text' ? interaction.arguments[1] as string : interaction.options.getString('player');

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
}

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