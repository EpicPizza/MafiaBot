import { firebaseAdmin } from "../firebase";
import { REST, Routes, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { Data } from "../discord";

interface Vote {
    id: string,
    for: string
}

export async function refreshCommands(players: string[]) {
    const commands = [
        new SlashCommandBuilder()
            .setName('vote')
            .setDescription('Vote for a player.')
            .addStringOption(option =>
                option  
                    .setName('player')
                    .setDescription('Which player to vote for?')
                    .setRequired(true)
                    .setChoices(players.map(player => { return { name: player, value: player }}))
            ),
        new SlashCommandBuilder()
            .setName('remove')
            .setDescription('Remove a player.')
            .addStringOption(option =>
                option  
                    .setName('player')
                    .setDescription('Which player to remove?')
                    .setRequired(true)
                    .setChoices(players.map(player => { return { name: player, value: player }}))
            )
    ]

    await setupCommands(commands);   
}

export async function setVote(options: { id: string, for: string, day: number }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes').doc(options.id);

    await ref.set({
        id: options.id,
        for: options.for,
    })
}

export async function removeVote(options: { id: string, day: number }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes').doc(options.id);

    await ref.delete();
}

export async function getVotes(options: { day: number }) {
    const db = firebaseAdmin.getFirestore();

    const ref = db.collection('day').doc(options.day.toString()).collection('votes');

    const docs = (await ref.get()).docs;

    const votes = new Array<Vote>();

    for(let i = 0; i < docs.length; i++) {
        const data = docs[i].data();

        if(data) {
            votes.push(data as Vote);
        }
    }

    return votes;
}

export async function resetVotes(options: { day: number | string } | undefined = undefined) {
    const db = firebaseAdmin.getFirestore();

    if(options) {
        const ref = db.collection('day').doc(options.day.toString()).collection('votes');

        const docs = await ref.listDocuments();

        const batch = db.batch();

        docs.forEach(ref => batch.delete(ref));

        await batch.commit();
    } else {
        const ref = db.collection('day');

        const days = await ref.listDocuments();

        for(let i = 0; i < days.length; i++) {
            await resetVotes({ day: days[i].id });
        }
    }
}

export async function setupCommands(extra: any[] = []) {
    const commands = extra as any[];

    // Grab all the command files from the commands directory you created earlier
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        const data: Data[] = command.data;

        if ('data' in command && 'execute' in command ) {
            data.forEach(command => { if((command.type == 'slash' && command.name != "slash-vote" && command.name != "slash-remove") || command.type == 'context') { commands.push(command.command.toJSON()); } });
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(process.env.DEV == 'TRUE' ? process.env.DEVTOKEN as string : process.env.TOKEN as string);

    // and deploy your commands!
    (async () => {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);

            // The put method is used to fully refresh all commands in the guild with the current set
            //await rest.put(Routes.applicationCommands(process.env.DEV == 'TRUE' ? process.env.DEVCLIENT as string : process.env.CLIENT as string), { body: [] });

            const data = await rest.put(
                (process.env.DEV == 'TRUE') ? Routes.applicationGuildCommands(process.env.DEVCLIENT as string, process.env.DEVGUILD as string) : Routes.applicationCommands(process.env.CLIENT as string),
                { body: commands },
            ) as any[];

            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            // And of course, make sure you catch and log any errors!
            console.error(error);
        }
    })();
}