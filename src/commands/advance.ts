import { getAllExtensions } from "../utils/extensions";
import { getGlobal } from '../utils/global';
import { getGames } from "../utils/mafia/games";
import { getAllNicknames } from "../utils/mafia/user";
import { subcommandHandler } from "../utils/subcommands";
import { builder } from "./advance/advance";

module.exports = subcommandHandler(builder, async (interaction) => {
    const focusedValue = interaction.options.getFocused(true);
    
    if(focusedValue.name == "game") {
        const games = await getGames();

        const filtered = games.filter(choice => choice.name.startsWith(focusedValue.value)).slice(0, 25);

        await interaction.respond(
            filtered.map(choice => ({ name: choice.name, value: choice.name })),
        );
    } else if(focusedValue.name == "player") {
        const nicknames = await getAllNicknames();
        
        const filtered = nicknames.filter(choice => choice.toLowerCase().startsWith(focusedValue.value.toLowerCase())).slice(0, 25);

        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        );
    } else {
        const action = interaction.options.getSubcommand();

        const global = await getGlobal();

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
}, true);