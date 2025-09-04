import { standardAutocomplete } from "../utils/autocomplete";
import { subcommandHandler } from "../utils/subcommands";
import { builder } from "./advance/advance";

module.exports = subcommandHandler(builder, standardAutocomplete, true);