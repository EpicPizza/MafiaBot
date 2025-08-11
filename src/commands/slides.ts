import { AttachmentBuilder, ChatInputCommandInteraction, FileBuilder, SlashCommandBuilder } from "discord.js";
import { Data, removeReactions } from "../discord";
import { getGlobal } from "../utils/main";
import { getUser, User } from "../utils/user";
import { Command } from "../discord";
import { firebaseAdmin } from "../firebase";
import { randomInt } from "crypto";
import { z } from "zod";
import { getClient } from "../google";
import { google } from 'googleapis';
import { finished } from "stream/promises";
import fs from 'fs';
import { spawn } from "child_process";
import { mkdir, readdir, rm, rmdir, stat } from "fs/promises";

const googleDocIdRegex = /docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9-_]+)/;

module.exports = {
    data: [
        {
            type: 'text',
            name: 'text-slides',
            command: {
                required: [ z.string() ],
            }
        },
    ] satisfies Data[],

    execute: async (interaction: Command) => {
        const client = getClient();
        const service = google.drive({ version: 'v3', auth: client });
        
        const link = interaction.arguments[0] as string;
        const match = googleDocIdRegex.exec(link);
        let id: undefined | string = undefined
        if (match && match.length > 1) id = match[0].substring(match[0].lastIndexOf("/") + 1);
        if(id == undefined) throw new Error("ID not found!");

        await interaction.message.react("<a:loading:1256150236112621578>");

        const result = await service.files.export({
            fileId: id,
            mimeType: 'application/pdf',
        }, {
            responseType: "stream"
        });

        if(result.status != 200) throw new Error("Failed to fetch!");

        const metadata = await service.files.get({
            fileId: id,
        });

        const name = metadata.data.name ?? crypto.randomUUID();
        
        const file = fs.createWriteStream(`${name}.pdf`);
        result.data.pipe(file);
        await finished(result.data);
        
        await mkdir(name);

        const child = spawn('magick', ['-density', '300', `${name}.pdf`, `./${name}/card.png`]);

        await new Promise(resolve => {
            child.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            child.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });

            child.on('close', (code) => {
                console.log(`child process exited with code ${code}`);

                resolve(0)
            })
        });

        const folder = await service.files.create({
            requestBody: {
                name: name, // Name your folder
                mimeType: 'application/vnd.google-apps.folder',
            },
            fields: 'id, webViewLink',
        });

        if(!folder.data.id || !folder.data.webViewLink) throw new Error("Folder failed!");

        await service.permissions.create({
            fileId: folder.data.id,
            requestBody: {
                type: 'anyone',
                role: 'reader'
            }
        });

        const files = await readdir('./' + name);

        await Promise.all(files.map(async file => {
            const filePath = './' + name + '/' + file;
            const fileStats = await stat(filePath);

            if(!fileStats.isFile()) throw new Error("File not found!");

            await service.files.create({
                requestBody: {
                    name: file,
                    parents: [ folder.data.id ?? "---" ]
                },
                media: {
                    mimeType: "image/png",
                    body: fs.createReadStream(filePath)
                }
            });
        }));

        await rmdir('./' + name, { recursive: true });
        await rm(`${name}.pdf`);

        await removeReactions(interaction.message);
        await interaction.reply(folder.data.webViewLink);
    }
}