import { ActivityType, ClientEvents, Events } from "discord.js";
import client from "./client";
import { checkFutureGrace, checkFutureLock } from "../utils/mafia/timing";
import { dumpTracking } from "../utils/mafia/tracking";
import { getAuthority } from "../utils/instance";

export async function clientReadyHandler(...[]: ClientEvents[Events.ClientReady]) {
    console.log("Bot is ready!");

    client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

    setInterval(async () => {
        try {
            await checkFutureLock();
            await checkFutureGrace();
            await dumpTracking();

            if (process.env.DEV == "FALSE") client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });
        } catch (e) {
            console.log(e);
        }
    }, 1000 * 15);
}