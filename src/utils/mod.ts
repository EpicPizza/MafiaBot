import { Guild } from "discord.js";
import { Setup } from "./setup";

export async function checkMod(setup: Setup, id: string, guild: string) {
    if(!(setup.primary.guild.id == guild || setup.secondary.guild.id == guild || setup.tertiary.guild.id == guild || process.env.DEVGUILD == guild)) throw new Error("You're not a mod!");

    const member = await setup.primary.guild.members.fetch(id);
    if(!(member?.roles.cache.has(setup.primary.mod.id) || id == process.env.OWNER)) throw new Error("You're not a mod!");
}