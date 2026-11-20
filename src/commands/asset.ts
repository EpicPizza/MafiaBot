import { AutocompleteInteraction } from "discord.js";
import { Event } from "../discord";
import { standardAutocomplete } from "../utils/autocomplete";
import { getVisibleAssets } from "../utils/assets";
import { isMod } from "../utils/mod";
import { subcommandHandler } from "../utils/subcommands";
import { builder } from "./asset/asset";

async function assetAutocomplete(interaction: Event<AutocompleteInteraction>) {
    interaction.inInstance();

    const focused = interaction.options.getFocused(true);
    if(focused.name != 'name') return await standardAutocomplete(interaction);

    const mod = await isMod(interaction.instance.setup, interaction.instance.global, interaction.user.id, interaction.guildId ?? "");

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
