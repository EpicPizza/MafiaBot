import { type Global } from '../utils/global';
import { Setup } from "./setup";

export async function checkMod(setup: Setup, global: Global, id: string, guild: string) {
    if(!(setup.primary.guild.id == guild || setup.secondary.guild.id == guild || setup.tertiary.guild.id == guild || process.env.DEVGUILD == guild)) throw new Error("You're not a mod!");

    const member = await setup.primary.guild.members.fetch(id);
    if(!(member?.roles.cache.has(setup.primary.mod.id) || global.admin.includes(id))) throw new Error("You're not a mod!");
}

export async function isMod(setup: Setup, global: Global, id: string, guild: string) {
    try {
        await checkMod(setup, global, id, guild);

        return true;
    } catch(e) {
        return false;
    }
}