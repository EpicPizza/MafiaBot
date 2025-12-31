import { AutocompleteInteraction } from "discord.js";
import { getAllNicknames } from "./mafia/user";
import { getGames } from "./mafia/games";
import { getAllExtensions } from "./extensions";
import { Instance } from "./instance";
import { Event } from "../discord";

export async function standardAutocomplete(interaction: Event<AutocompleteInteraction>) {
    interaction.inInstance();

    const focusedValue = interaction.options.getFocused(true);
    
    if(focusedValue.name == "game") {
        const games = await getGames(interaction.instance);

        const filtered = games.filter(choice => choice.name.startsWith(focusedValue.value)).slice(0, 25);

        await interaction.respond(
            filtered.map(choice => ({ name: choice.name, value: choice.name })),
        );
    } else if(focusedValue.name == "player") {
        const nicknames = await getAllNicknames(interaction.instance);
        
        const filtered = nicknames.filter(choice => choice.toLowerCase().startsWith(focusedValue.value.toLowerCase())).slice(0, 25);

        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        );
    } else {
        const action = interaction.options.getSubcommand();

        const global = interaction.instance.global;

        let names = getAllExtensions().map(extension => extension.name).splice(0, 25);

        switch(action) {
            case 'disable':
                names = names.filter(extension => global.extensions.find(enabled => enabled == extension));
                break;
            case 'enable':
                names = names.filter(extension => !global.extensions.find(enabled => enabled == extension));
                break;
        }

        await interaction.respond(
            names.map(choice => ({ name: choice + " Extension", value: choice })),
        );
    }
}