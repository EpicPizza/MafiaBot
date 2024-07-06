import { APIActionRowComponent, APIButtonComponent, ButtonInteraction, ButtonStyle, TextChannel } from "discord.js";
import { z } from "zod";
import { getGameByID, getGlobal } from "../../utils/main";
import { firebaseAdmin } from "../../firebase";
import { getGameSetup } from "../../utils/games";
import { Setup, getSetup } from "../../utils/setup";
import { getUser } from "../../utils/user";
import { Global } from "../../utils/main";

export const ChangeAlignmentButton = {
    type: 'button',
    name: 'button-change-alignment',
    command: z.object({
        name: z.literal('change-alignment'),
        id: z.string(),
    }),
    execute: async (interaction: ButtonInteraction) => {
        const id = JSON.parse(interaction.customId);

        const global = await getGlobal();

        if((global.day != 0 && global.started) || !global.started) throw new Error("Command cannot be run.");
        
        const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]
        const player = id.id as string;
        let alignment: 'mafia' | null = null;

        for(let i = 0; i < components.length; i++) {
            for(let j = 0; j < components[i].components.length; j++) {
                const button = components[i].components[j];

                if(button.style != ButtonStyle.Link && button.custom_id == interaction.customId) {
                    if(button.style == ButtonStyle.Secondary) {
                        button.style = ButtonStyle.Danger;
                        alignment = 'mafia';
                    } else if(button.style == ButtonStyle.Danger) {
                        button.style = ButtonStyle.Secondary;
                        alignment = null;
                    }
                }
            }
        }

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('settings').doc('game');

        await db.runTransaction(async t => {
            const global = await getGlobal(t);

            for(let i = 0; i < global.players.length; i++) {
                if(global.players[i].id == player) {
                    global.players[i].alignment = alignment;
                }
            }

            t.update(ref, {
                players: global.players
            })
        })

        await interaction.update({ components: components });
    }
}

export const ConfirmAllignmentsButton = {
    type: 'button',
    name: 'button-confirm-alignments',
    command: z.object({
        name: z.literal('confirm-alignments'),
    }),
    execute: async (interaction: ButtonInteraction) => {
        const components = (interaction.message.toJSON() as any).components as APIActionRowComponent<APIButtonComponent>[]

        for(let i = 0; i < components.length; i++) {
            for(let j = 0; j < components[i].components.length; j++) {
                const button = components[i].components[j];

                if(button.style != ButtonStyle.Link && button.label == "Confirm") {
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

        await firebaseAdmin.getFirestore().collection('settings').doc('game').update({
            day: 1,
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

        await db.collection('invites').add({
            id: user.id,
            type: 'mafia',
            timestamp: new Date().valueOf(),
        });
    }
}