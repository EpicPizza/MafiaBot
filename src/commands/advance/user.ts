import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { fromZod } from "../../utils/text";
import { z } from "zod";
import { Event, TextCommand } from "../../discord";
import { firebaseAdmin } from "../../utils/firebase";
import { createUser, editUser, getUser, getUserByName, User } from "../../utils/mafia/user";
import { Subcommand } from "../../utils/subcommands";
import { removeReactions } from "../../discord/helpers";

const requirements = z.string().max(20, "Max length 20 characters.").min(1, "Min length two characters.").regex(/^[a-zA-Z\/]+$/, "Only letters allowed. No spaces.");

export const ReserveCommmand = {
    name: "reserve",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('reserve')
        .setDescription('Reserve a nickname.')
        .addStringOption(option => 
            option 
                .setName('nickname')
                .setDescription('Nickname to reserve...')
                .setRequired(true)
        ),
    text: () => {
        return new Command()
            .name('reserve')
            .description('Reserve a nickname.')
            .argument('<nickname>', 'nickname to reserve', fromZod(requirements));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const nickname = interaction.type == 'text' ? interaction.program.processedArgs[0] : requirements.parse(interaction.options.getString('nickname'));

        const fetch = await getUserByName(nickname, interaction.instance);

        console.log(nickname);

        if(fetch != undefined) {
            if(fetch.state == 1 || fetch.state == 6 || fetch.state == 2) {
                throw new Error("Unknown user / Duplicate names not allowed.");
            } else if(fetch.state == 3) {
                throw new Error("Already reserved?");
            }
        }

        const db = firebaseAdmin.getFirestore();

        const id = "reserved-" + crypto.randomUUID();

        const ref = db.collection('instances').doc(interaction.instance.id).collection('users').doc(id);

        await ref.set({
            nickname: nickname,
            lName: nickname.toLowerCase(),
            id: id,
            channel: null,
            pronouns: null,
            state: 3,
        } satisfies User);

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Reserved nickname."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;

export const ImportCommand = {
    name: "import",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('import')
        .setDescription('Import a user.')
        .addUserOption(option =>
            option  
                .setName('member')
                .setDescription('Member to set nickname.')
                .setRequired(true)
        )
        .addStringOption(option => 
            option 
                .setName('nickname')
                .setDescription('Nickname to reserve...')
                .setRequired(true)
        ),
    text: () => {
        return new Command()
            .name('import')
            .description('Reserve a nickname.')
            .argument('<@member>', 'id to invite', fromZod(z.string()))
            .argument('<nickname>', 'nickname to reserve', fromZod(requirements));
    },

    execute: async (interaction: Event<TextCommand | ChatInputCommandInteraction>) => {
        interaction.inInstance();

        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const nickname = interaction.type == 'text' ? interaction.program.processedArgs[1] : requirements.parse(interaction.options.getString('nickname'));

        const id: string = interaction.type == 'text' ? interaction.program.processedArgs[0] : interaction.options.getUser('member')?.id
        const user = await getUser(id, interaction.instance);

        const fetch = await getUserByName(nickname, interaction.instance);

        console.log(nickname);

        if(user != undefined && fetch != undefined && fetch.id != user.id) {
            if(fetch.state == 1 || fetch.state == 6 || fetch.state == 2) {
                throw new Error("Unknown user / Duplicate names not allowed.");
            } else if(fetch.state == 3) {
                throw new Error("Reserved nickname.");
            }
        }

        const db = firebaseAdmin.getFirestore();

        const ref = db.collection('instances').doc(interaction.instance.id).collection('users').doc(id);

        await ref.set({
            nickname: nickname,
            lName: nickname.toLowerCase(),
            id: id,
            channel: null,
            pronouns: null,
            state: 2,
        } satisfies User);

        if(interaction.type != 'text') {
            await interaction.editReply({ content: "User imported."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;