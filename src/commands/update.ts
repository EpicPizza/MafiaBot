import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Data, removeReactions } from "../discord";
import { getGlobal } from "../utils/main";
import { getUser, User } from "../utils/user";
import { Command } from "../discord";
import { firebaseAdmin } from "../firebase";
import { randomInt } from "crypto";
import { checkMod } from "../utils/mod";
import { getSetup } from "../utils/setup";
import { Readable, Writable } from "stream";
import csvParser from "csv-parser";
import { finished } from "stream/promises";
import { z } from "zod";
import { Stat } from "../utils/stats";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-update',
            command: new SlashCommandBuilder()
                .setName("update")
                .setDescription("Update stats, don't use if you don't know what this is for.")
                .addAttachmentOption(option =>
                    option
                        .setName('glicko')
                        .setDescription('CSV file for glicko.')
                        .setRequired(true)
                )
                .addAttachmentOption(option =>
                    option
                        .setName('rankings')
                        .setDescription('CSV file for rankings.')
                        .setRequired(true)
                )
        },
        {
            type: 'text',
            name: 'text-update',
            command: {}
        }
    ] satisfies Data[],

    execute: async (interaction: ChatInputCommandInteraction | Command) => {
        if(interaction.type != 'text') {
            await interaction.deferReply();
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const setup = await getSetup();
        const global = await getGlobal();

        await checkMod(setup, global, interaction.user.id, (interaction.type == 'text' ? interaction.message.guildId : interaction.guildId) ?? "---");

        const glickoAttachment = interaction.type == 'text' ? interaction.message.attachments.find(attachment => attachment.name?.endsWith("History.csv")) : interaction.options.getAttachment('glicko') ?? undefined;
        if(glickoAttachment == null || !glickoAttachment.contentType?.includes("text/csv") || glickoAttachment.size > (100 * 1000)) throw new Error("Invalid glicko file!");

        const rankingsAttachment = interaction.type == 'text' ? interaction.message.attachments.find(attachment => attachment.name?.endsWith("calculations.csv")) : interaction.options.getAttachment('rankings') ?? undefined;
        if(rankingsAttachment == null || !rankingsAttachment.contentType?.includes("text/csv") || rankingsAttachment.size > (100 * 1000)) throw new Error("Invalid rankings file!"); 

        const glicko = await fetchGlicko(glickoAttachment.url);
        const rankings = await fetchRankings(rankingsAttachment.url);

        const overall = glicko.map(entry => {
            const rank = rankings[entry.Player];

            return {
                player: entry.Player.trim(),
                gxe: entry.GXE.trim(),
                wr: rank == undefined ? "N/A" : rank.trim()
            } satisfies Stat;
        });

        const db = firebaseAdmin.getFirestore();
        const ref = db.collection('settings').doc('stats');
        await ref.set({
            overall
        });

        if(interaction.type == 'text') { 
            await removeReactions(interaction.message);
            await interaction.message.react("✅");
        } else {
            await interaction.editReply("Updated.");
        }
    }
}

async function fetchGlicko(url: string) {
    const results = [] as any[];

    const { body } = await fetch(url);
    if(body == null) throw new Error("Unable to fetch!");

    const csv = csvParser({
        headers: [ "Rank", "Player", "GXE", "Rating", "Peak", "GP" ],
    });

    const readable = Readable.fromWeb(body as any).pipe(csv);
     
    readable.on('data', (data) => {
        results.push(data);
    });

    await finished(readable);   

    const glicko = GXE.parse(results.splice(5));
    
    return glicko;
}

async function fetchRankings(url: string) {
    const results = [] as any[];
     
    const { body } = await fetch(url);
    if(body == null) throw new Error("Unable to fetch!");

    const readable = Readable.fromWeb(body as any).pipe(csvParser());
    
    readable.on('data', (data) => {
        results.push(data);
    });

    await finished(readable);

    if(results.length < 3) throw new Error("Invalid?");

    const wr = Winrate.parse(results[3]);

    return wr as Record<string, string | undefined>;
}
 
const Winrate = z.record(z.string(), z.custom(data => {
    if(typeof data != 'string') return false;

    if(data.endsWith("%") || data.includes("N/A") || data.includes("win percentage")) return true;

    return false;
}))

const GXE = z.object({
    Player: z.string(),
    GXE: z.string(),
}).array(); 