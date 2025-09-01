import { ActivityType, ClientEvents, Events } from "discord.js";
import client from "./client";
import { checkFutureGrace, checkFutureLock } from "../utils/mafia/timing";
import { updateCache } from "./message";

export async function clientReadyHander(...[]: ClientEvents[Events.ClientReady]) {
    console.log("Bot is ready!");

    client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

    try {
        await updateCache();
    } catch (e) {
        console.log(e);
    }

    setInterval(async () => {
        try {
            await checkFutureLock();
            await checkFutureGrace();

            if (process.env.DEV == "FALSE") client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

            await updateCache();
        } catch (e) {
            console.log(e);
        }
    }, 1000 * 15);
}