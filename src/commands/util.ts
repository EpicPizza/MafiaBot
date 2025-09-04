import { standardAutocomplete } from "../utils/autocomplete";
import { subcommandHandler } from "../utils/subcommands";
import { builder } from "./util/util";

module.exports = subcommandHandler(builder, standardAutocomplete, true);