import { SlashCommandBuilder, EmbedBuilder, Colors, ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";
import { Data, Event, TextCommand } from '../discord';
import { Command } from "commander";
import { firebaseAdmin } from "../utils/firebase";

module.exports = {
    data: [
        { 
            type: 'slash',
            name: 'slash-help',
            command: new SlashCommandBuilder()
                .setName('help')
                .setDescription('How to use Mafia Bot and its commands.')
        },
        {
            type: 'text',
            name: 'text-help',
            description: 'How to use Mafia Bot and its commands.',
            command: () => {
                return new Command()
                    .name('help')
                    .description('How to use Mafia Bot and its commands.')
            }
        }
    ] satisfies Data[],

    execute: async (interaction: Event<ChatInputCommandInteraction | StringSelectMenuInteraction | TextCommand>) => {
        const domain = process.env.DEV === "TRUE" ? process.env.DEVDOMAIN : process.env.DOMAIN;
        const db = firebaseAdmin.getFirestore();
        
        let descriptionText = "";
        
        const query = db.collection('documents').where('integration', '==', 'Help');
        const docs = (await query.get()).docs;
        
        if (docs.length > 0) {
            const data = docs[0].data();
            const subpages = data.subpages as string[] ?? [];
            
            if (data.description) descriptionText += `${data.description}\n\n`;
            
            const subpageDocs = await Promise.all(subpages.map(id => db.collection('documents').doc(id).get()));
            
            const links = subpageDocs.map(doc => {
                const subData = doc.data();
                const title = subData?.title || doc.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const desc = subData?.description ? ` - ${subData.description}` : "";
                return `- [${title}](${domain}/docs/${subData?.route}/)${desc}`;
            }).join('\n');
            
            descriptionText += links;
        }

        const embed = new EmbedBuilder()
            .setTitle("Mafia Bot Help")
            .setColor(Colors.Orange)
            .setDescription(descriptionText);

        if (interaction.type !== 'text' && interaction.isStringSelectMenu()) {
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            await interaction.reply({ embeds: [embed], components: [] });
        }
    }
}