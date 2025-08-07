import { APIActionRowComponent, APIButtonComponent, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Colors, EmbedBuilder, SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { z } from "zod";
import { getGameByID, getGlobal } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";
import { getGameSetup } from "../../utils/games";
import { Setup, getSetup } from "../../utils/setup";
import { getUser, getUsers } from "../../utils/user";
import { Global } from "../../utils/main";
import { Command, onjoin, TextCommandArguments } from "../../discord";

export const ShowAlignments = {
    name: "alignments",
    description: "?mod alignments",
    command: {
        slash: new SlashCommandSubcommandBuilder()
            .setName("alignments")
            .setDescription("Shows all alignments."),
        text: {

        } satisfies TextCommandArguments
    },
    execute: async (interaction: Command | ChatInputCommandInteraction) => {
        const global = await getGlobal();
        if(global.started == false) throw new Error("Game has not started!");
        const game = await getGameByID(global.game ?? "---");
        const setup = await getSetup();
        if(game == null) throw new Error("Game not found.");
        const gameSetup = await getGameSetup(game, setup);

        if(gameSetup.spec.id != (interaction.type == 'text' ? interaction.message.channelId : interaction.channelId)) throw new Error("Uh, this shouldn't be run outside of spectator channel.");

        const users = await getUsers(game.signups);
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
    command: z.object({
        name: z.literal('confirm-alignments'),
    }),
    execute: async (interaction: ButtonInteraction) => {
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

        const global = await getGlobal();
        const setup = await getSetup();
        const which = await getGameByID(global.game ?? "");
        
        if(typeof setup == 'string') throw new Error("Setup Incomplete");
        if(which == null) throw new Error("Game not found.");

        const gameSetup = await getGameSetup(which, setup);

        for(let i = 0; i < global.players.length; i++) {
            if(global.players[i].alignment == 'mafia') {
                await addMafiaPlayer(global.players[i], setup);
            }
        }

        const invite = await setup.tertiary.guild.invites.create(gameSetup.mafia, { unique: true });

        await gameSetup.spec.send("Here is the invite link for mafia server: \nhttps://discord.com/invite/" + invite.code + "\nUse the **\/mod unlock** command to start the game when it's ready!");

        const db = firebaseAdmin.getFirestore();

        await db.collection('settings').doc('game').update({
            day: 1,
        });

        await db.collection('day').doc((1).toString()).set({
            game: global.game,
            players: global.players.map((player) => player.id),
        });
    }
}

export async function addMafiaPlayer(player: Global["players"][0], setup: Setup) {
    const mafiaMember = await setup.tertiary.guild.members.fetch(player.id).catch(() => undefined);

    const user = await getUser(player.id);

    if(user == undefined || user.channel == null) throw new Error("User not found/setup.");

    const channel = await setup.secondary.guild.channels.fetch(user.channel).catch(() => null) as TextChannel | null;

    if(channel == null) throw new Error("Channel not found.");

    if(mafiaMember?.joinedTimestamp) {
        await mafiaMember.roles.remove(setup.tertiary.spec);
        await mafiaMember.roles.add(setup.tertiary.access);
    } else {
        const db = firebaseAdmin.getFirestore();

        await onjoin({
            id: user.id,
            server: "tertiary",
            roles: {
                add: ["access"],
            }
        });
        
    }
}