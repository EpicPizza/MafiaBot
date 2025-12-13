import { Command } from "commander";
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { fromZod } from "../../utils/text";
import { z } from "zod";
import { TextCommand } from "../../discord";
import { firebaseAdmin } from "../../utils/firebase";
import { getGlobal } from "../../utils/global";
import { createUser, editUser, getUser, getUserByName } from "../../utils/mafia/user";
import { Subcommand } from "../../utils/subcommands";
import { removeReactions } from "../../discord/helpers";

const requirements = z.string().max(20, "Max length 20 characters.").min(1, "Min length two characters.").regex(/^[a-zA-Z\/]+$/, "Only letters allowed. No spaces.");

export const NicknameCommmand = {
    name: "nickname",
    subcommand: true,

    slash: new SlashCommandSubcommandBuilder()
        .setName('nickname')
        .setDescription('Set nickname of a member.')
        .addUserOption(option =>
            option  
                .setName('member')
                .setDescription('Member to set nickname.')
                .setRequired(true)
        )
        .addStringOption(option => 
            option 
                .setName('nickname')
                .setDescription('Set nickname to...')
                .setRequired(true)
        )
        .addStringOption(option => 
            option 
                .setName('pronouns')
                .setDescription('Set pronouns to...')
                .setRequired(false)
        ),
    text: () => {
        return new Command()
            .name('nickname')
            .description('Set a nickname of a player.')
            .argument('<@member>', '@ to invite', fromZod(z.string().regex(/^<@\d+>$/, "Not a valid @!")))
            .argument('<nickname>', 'nickname to set', fromZod(requirements))
            .argument('[pronouns]', 'pronouns to set', fromZod(requirements));
    },

    execute: async (interaction: TextCommand | ChatInputCommandInteraction) => {
        if(interaction.type != 'text') {
            await interaction.deferReply({ ephemeral: true });
        } else {
            await interaction.message.react("<a:loading:1256150236112621578>");
        }

        const nickname = interaction.type == 'text' ? interaction.program.processedArgs[1] : requirements.parse(interaction.options.getString('nickname'));
        const pronouns = interaction.type == 'text' ? (interaction.program.processedArgs.length > 2 ? interaction.program.processedArgs[2] as string : undefined) : ( interaction.options.getString('pronouns') ? requirements.parse(interaction.options.getString('pronouns')) : undefined);

        const id: string = interaction.type == 'text' ? interaction.program.processedArgs[0].substring(2, interaction.program.processedArgs[0].length - 1) : interaction.options.getUser('member')?.id
        const user = await getUser(id);

        const fetch = await getUserByName(nickname);

        console.log(nickname);

        if(user != undefined && fetch != undefined && fetch.id != user.id) throw new Error("Unknown user / Duplicate names not allowed.");

        if(user) {
            await editUser(id, { nickname: nickname, ... (pronouns ? { pronouns: pronouns } : {}) } );
        } else {
            await createUser(id, nickname, pronouns ?? null);
        }
    
        if(interaction.type != 'text') {
            await interaction.editReply({ content: "Player set."});
        } else {
            await removeReactions(interaction.message);

            await interaction.message.react("✅");
        }
    }
} satisfies Subcommand;