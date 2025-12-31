import { ActivityType, ClientEvents, Events } from "discord.js";
import client from "./client";
import { checkFutureGrace, checkFutureLock } from "../utils/mafia/timing";
import { dumpTracking, startup } from "../utils/mafia/tracking";
import { getAuthority, getCachedInstances, getInstance, getInstances } from "../utils/instance";
import { websiteListener } from "../utils/website";

export async function clientReadyHandler(...[]: ClientEvents[Events.ClientReady]) {
    console.log("Bot is ready!");

    client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });

    try {
        const instances = await getCachedInstances();

        await startup(instances);
        await websiteListener();
    } catch(e) {
        console.log(e);
    }

    setInterval(async () => {
        try {
            const instances = await getCachedInstances();

            Promise.all(instances.map(async instance => {
                await checkFutureLock(instance);
                await checkFutureGrace(instance);
            }));

            await dumpTracking();

            if (process.env.DEV == "FALSE") client.user?.setActivity({ type: ActivityType.Watching, name: "/games", });
        } catch (e) {
            console.log(e);
        }
    }, 1000 * 15);
}