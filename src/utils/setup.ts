import { ChannelType, PermissionsBitField } from "discord.js";
import client from "../discord";
import { firebaseAdmin } from "../firebase";
import { getGame } from "./game";

export async function getSetup() {
    const game = await getGame();

    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('settings').doc('setup')

    const data = (await ref.get()).data();

    if(!data) throw new Error("Shit");

    if(data.gm == null || data.chat == null || data.alive == null || data.gang == null || data.guild == null) return "Setup not complete."

    const guild = await client.guilds.fetch(data.guild);
    if(!guild) return;

    const channel = await guild.channels.fetch(data.chat);
    if(!channel || channel.type != ChannelType.GuildText) return;

    const permissions = channel.permissionsFor((process.env.DEV == "TRUE" ? process.env.DEVCLIENT : process.env.CLIENT) as string);
    if(!permissions) return;

    if(!permissions.has([ PermissionsBitField.Flags.ManageRoles ])) return "Does not have permission to edit permissions.";

    return {
        gm: data.gm as string,
        chat: channel,
        gang: data.gang as string,
        alive: data.alive as string,
    }
}