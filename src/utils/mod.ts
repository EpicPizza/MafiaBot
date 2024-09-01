import { Setup } from "./setup";

export async function checkMod(setup: Setup, id: string) {
    const member = await setup.primary.guild.members.fetch(id);
    if(!(member?.roles.cache.has(setup.primary.mod.id) || id == process.env.OWNER)) throw new Error("You're not a mod!");
}