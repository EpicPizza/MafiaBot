import { ActivityType, ClientEvents, Events } from "discord.js";
import client from "./client";

export async function clientReadyHandler(...[]: ClientEvents[Events.ClientReady]) {
    console.log("Bot is ready!");

    client.user?.setActivity({ type: ActivityType.Watching, name: "for commands" });
}
