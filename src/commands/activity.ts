import { Command } from "commander";
import { Colors, EmbedBuilder } from "discord.js";
import { z } from "zod";
import { Data, Event } from '../discord';
import { TextCommand } from '../discord';
import { simpleJoin } from '../utils/text';
import { firebaseAdmin } from "../utils/firebase";
import { getGameByID } from "../utils/mafia/games";
import { getUserByName } from "../utils/mafia/user";
import { TrackedMessage } from "../utils/mafia/tracking";

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-activity',
            command: () => {
                return new Command()
                    .name('activity')
                    .description('View message and word count for specified nicknames during the current day.')
                    .argument("<nicknames...>", "space-separated list of nicknames", simpleJoin);
            }
        },
    ] satisfies Data[],

    execute: async (interaction: Event<TextCommand>) => {
        interaction.inInstance();

        const global = interaction.instance.global;

        if(global.started == false) throw new Error("Game has not started.");
        if(global.game == null) throw new Error("No active game.");

        const game = await getGameByID(global.game, interaction.instance);
        if(game == null) throw new Error("Game not found.");

        const day = global.day;

        const db = firebaseAdmin.getFirestore();

        // Get the start timestamp for the current day
        let start: number | undefined;

        if(day === 1) {
            // Day 1 uses the game's start timestamp since /mod unlock is never run on day 1
            start = game.start ?? undefined;
        } else {
            const dayDoc = await db.collection('instances').doc(interaction.instance.id)
                .collection('games').doc(game.id)
                .collection('days').doc(day.toString()).get();

            start = dayDoc.data()?.start as number | undefined;
        }

        if(start == undefined) throw new Error("Day " + day + " has no start timestamp.");

        const end = interaction.message.createdTimestamp;

        // Parse space-separated nicknames
        const nicknameInput = interaction.program.processedArgs[0] as string;
        const nicknames = nicknameInput.split(" ").map(n => n.trim()).filter(n => n.length > 0);

        if(nicknames.length == 0) throw new Error("No nicknames provided.");

        // Resolve nicknames to user IDs — fail early if any not found
        const resolved: { nickname: string, id: string }[] = [];

        for(const nickname of nicknames) {
            const user = await getUserByName(nickname, interaction.instance);

            if(!user) throw new Error("Nickname not found: " + nickname);

            resolved.push({ nickname: user.nickname, id: user.id });
        }

        const authorIds = new Set(resolved.map(r => r.id));

        // Query tracked messages in the chat channel within the day's time window
        const channelId = interaction.instance.setup.primary.chat.id;
        const stats = new Map<string, { messages: number, words: number }>();

        for(const r of resolved) {
            stats.set(r.id, { messages: 0, words: 0 });
        }

        let offset = 0;

        while(true) {
            const ref = db.collection('channels').doc(channelId).collection('messages')
                .orderBy('createdTimestamp', 'asc')
                .where('createdTimestamp', '>=', start)
                .where('createdTimestamp', '<=', end)
                .limit(500)
                .offset(offset);

            const trackedMessages = ((await ref.get()).docs.map(doc => doc.data()) as (TrackedMessage | { deleted: true })[])
                .filter(message => 'authorId' in message);

            offset += 500;

            for(const message of trackedMessages) {
                if(authorIds.has(message.authorId)) {
                    const current = stats.get(message.authorId)!;
                    current.messages += 1;
                    current.words += message.content.split(" ").length;
                }
            }

            if(trackedMessages.length < 500) break;
        }

        // Build the embed
        const list = resolved.map(r => {
            const s = stats.get(r.id)!;
            return {
                name: r.nickname,
                messages: s.messages,
                words: s.words,
            };
        });

        list.sort((a, b) => b.messages - a.messages);

        let message = list.reduce((previous, current) =>
            previous += `${current.name} » ${current.messages} message${current.messages === 1 ? "" : "s"} containing ${current.words} word${current.words === 1 ? "" : "s"}\n`, "");

        const embed = new EmbedBuilder()
            .setTitle("Activity » Today (Day " + day + ")")
            .setColor(Colors.Gold)
            .setDescription(message == '' ? "No Stats" : message);

        await interaction.reply({ embeds: [embed] });
    }
}
