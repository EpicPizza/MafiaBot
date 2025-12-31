import { ActivityType, ClientEvents, Events } from "discord.js";
import client from "./client";
import { checkFutureGrace, checkFutureLock } from "../utils/mafia/timing";
import { dumpTracking, startup } from "../utils/mafia/tracking";
import { getAuthority, getInstance } from "../utils/instance";
import { websiteListener } from "../utils/website";

export async function clientReadyHandler(...[]: ClientEvents[Events.ClientReady]) {
    console.log("Bot is ready!");

    client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

    try {
        await startup();
        await websiteListener();
    } catch(e) {
        console.log(e);
    }

    setInterval(async () => {
        try {
            const instance = await getInstance(process.env.INSTANCE ?? "---");
            if(instance == undefined) throw new Error("Instance not found!");

            await checkFutureLock(instance);
            await checkFutureGrace(instance);
            await dumpTracking();

            if (process.env.DEV == "FALSE") client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });
        } catch (e) {
            console.log(e);
        }
    }, 1000 * 15);
}