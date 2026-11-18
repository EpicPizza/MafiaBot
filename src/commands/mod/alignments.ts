import { Command } from "commander";
import { APIActionRowComponent, APIButtonComponent, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { z } from "zod";
import { Event, type TextCommand } from '../../discord';
import { firebaseAdmin } from "../../utils/firebase";
import { type Global } from '../../utils/global';
import { getGameByID, getGameSetup } from "../../utils/mafia/games";
import { onjoin } from "../../utils/mafia/invite";
import { grantMafiaAccess } from "../../utils/mafia/main";
import { getUser, getUsers } from "../../utils/mafia/user";
import { Setup, getSetup } from "../../utils/setup";
import { Subinteraction } from "../../utils/subcommands";
import { Instance } from "../../utils/instance";
import { stateRef } from "../../utils/mafia/state";
import { getRunningGame, type GameContext } from "../../utils/mafia/context";
import type { Player } from "../../utils/mafia/main";

export const ShowAlignments = {
    name: "alignments",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName("alignments")
        .setDescription("Shows all alignments."),
    text: () => {
        return new Command()
            .name('alignments')
            .description('Shows alignments of all players, must be run in spectator chat.')
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        const ctx = await getRunningGame(interaction.instance);

        const global = ctx.state;
        const game = ctx.game;
        const setup = interaction.instance.setup;
        if(game == null) throw new Error("Game not found.");
        const gameSetup = ctx.gameSetup;

        if(gameSetup.spec.id != (interaction.type == 'text' ? interaction.message.channelId : interaction.channelId)) throw new Error("Uh, this shouldn't be run outside of spectator channel.");

        const users = await getUsers(game.signups, interaction.instance);
        const players = global.players.map(player => ({ user: users.get(player.id), alignment: player.alignment })).filter(player => player.user != undefined);

        const embed = new EmbedBuilder()
            .setTitle("Alignments")
            .setColor(Colors.Red)
            .setDescription(players.map(player => {
                switch(player.alignment) {
                    case 'default':
                    case null:
                        return player.user?.nickname + " - 💼 Default";
                    case 'neutral':
                        return player.user?.nickname + " - 📎 " + player.alignment;
                    case 'mafia':
                        return player.user?.nickname + " - 🔪 " + player.alignment;
                    default:
                        return player.user?.nickname + " - 🎲 " + player.alignment;
                }
            }).reduce((prev, curr) => prev + curr + "\n", ""));

        return interaction.reply({ embeds: [embed] });
    }
}

export const ConfirmAlignmentsButton = {
    type: 'button',
    name: 'button-confirm-alignments',
    subcommand: true,

    command: z.object({
        name: z.literal('confirm-alignments'),
    }),

    execute: async (interaction: Event<ButtonInteraction>) => {
        interaction.inInstance();

        const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]

        for(let i = 0; i < components.length; i++) {
            for(let j = 0; j < components[i].components.length; j++) {
                const component = components[i].components[j];

                if(component.style != ButtonStyle.Link) {
                    components[i].components[j].disabled = true;   
                }
            }
        }

        await interaction.update({ components: components });

        const ctx = await getRunningGame(interaction.instance);

        const global = ctx.state;
        const setup = interaction.instance.setup;
        const which = ctx.game;
        
        if(typeof setup == 'string') throw new Error("Setup Incomplete");
        if(which == null) throw new Error("Game not found.");

        const gameSetup = ctx.gameSetup;

        for(let i = 0; i < global.players.length; i++) {
            if(global.players[i].alignment == 'mafia') {
                await addMafiaPlayer(global.players[i], ctx);
            }
        }

        const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia, { unique: true });

        await gameSetup.spec.send("Here is the invite link for mafia server: \nhttps://discord.com/invite/" + invite.code + "\nUse the **\/mod unlock** command to start the game when it's ready!");

        const db = firebaseAdmin.getFirestore();

        await stateRef(interaction.instance, ctx.game.id).update({
            day: 1,
        });

        await db.collection('instances').doc(interaction.instance.id).collection('games').doc(which.id).collection('days').doc((1).toString()).set({
            game: ctx.game.id,
            players: global.players.map((player) => player.id),
            start: new Date().valueOf(),
        });
    }
} satisfies Subinteraction;

export async function addMafiaPlayer(player: Player, ctx: GameContext): Promise<boolean> {
    const { instance, gameSetup } = ctx;

    const mafiaMember = await instance.setup.tertiary.guild.members.fetch(player.id).catch(() => undefined);

    const user = await getUser(player.id, instance);

    if(user == undefined || user.channel == null) throw new Error("User not found/setup.");

    const channel = await instance.setup.secondary.guild.channels.fetch(user.channel).catch(() => null) as TextChannel | null;

    if(channel == null) throw new Error("Channel not found.");

    if(mafiaMember?.joinedTimestamp) {
        await mafiaMember.roles.remove(instance.setup.tertiary.spec);
        await grantMafiaAccess(mafiaMember.id, instance.setup, gameSetup.mafia);

        return true;
    } else {
        // not in the mafia server yet, grant mafia channel permissions once they join
        await onjoin({
            id: user.id,
            server: "tertiary",
            roles: {},
            permissions: {
                channel: gameSetup.mafia.id,
            }
        }, instance);

        return false;
    }
}