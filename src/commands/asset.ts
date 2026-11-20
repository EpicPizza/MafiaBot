import { AutocompleteInteraction } from "discord.js";
import { Event } from "../discord";
import { standardAutocomplete } from "../utils/autocomplete";
import { getVisibleAssets } from "../utils/assets";
import { getVisibleGroups } from "../utils/assetGroups";
import { isMod } from "../utils/mod";
import { subcommandHandler } from "../utils/subcommands";
import { builder } from "./asset/asset";

async function assetAutocomplete(interaction: Event<AutocompleteInteraction>) {
    interaction.inInstance();

    const focused = interaction.options.getFocused(true);
    if(focused.name != 'name' && focused.name != 'group' && focused.name != 'assets') return await standardAutocomplete(interaction);

    const mod = await isMod(interaction.instance.setup, interaction.instance.global, interaction.user.id, interaction.guildId ?? "");

    if(focused.name == 'group') {
        const query = focused.value.toLowerCase();
        const groups = await getVisibleGroups(interaction.instance, mod);

        return await interaction.respond(
            groups
                .filter(group => group.name.toLowerCase().includes(query))
                .slice(0, 25)
                .map(group => ({ name: group.name + (group.visibility == 'private' ? ' 🔒' : ''), value: group.name }))
        );
    }

    if(focused.name == 'assets') {
        // Comma-separated list: complete the last entry, keeping the ones before it.
        const parts = focused.value.split(",");
        const query = parts.pop()!.trim().toLowerCase();
        const before = parts.map(part => part.trim()).filter(part => part.length > 0);
        const prefix = before.length > 0 ? before.join(", ") + ", " : "";

        const assets = (await getVisibleAssets(interaction.instance, mod))
            .filter(asset => asset.name.toLowerCase().includes(query))
            .filter(asset => !before.some(part => part.toLowerCase() == asset.name.toLowerCase()));

        return await interaction.respond(
            assets
                .map(asset => ({ name: (prefix + asset.name).slice(-100), value: prefix + asset.name }))
                .filter(choice => choice.value.length <= 100)
                .slice(0, 25)
        );
    }

    const query = focused.value.toLowerCase();
    const assets = await getVisibleAssets(interaction.instance, mod);

    await interaction.respond(
        assets
            .filter(asset => asset.name.toLowerCase().includes(query))
            .slice(0, 25)
            .map(asset => ({ name: asset.name + (asset.visibility == 'private' ? ' 🔒' : ''), value: asset.name }))
    );
}

// Mod checks happen per subcommand: display and search are open to everyone.
module.exports = subcommandHandler(builder, assetAutocomplete);
