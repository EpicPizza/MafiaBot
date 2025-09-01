import { Message } from "discord.js";
import client from "./client";

export async function removeReactions(message: Message) {
    const userReactions = message.reactions.cache.filter(reaction => reaction.users.cache.has(client.user?.id ?? ""));

    try {
        for (const reaction of userReactions.values()) {
            await reaction.users.remove(client.user?.id ?? "");
        }
    } catch (error) {
        console.error('Failed to remove reactions.');
    }
}
