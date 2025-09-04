import path from 'node:path';
import { subcommandBuilder } from '../../utils/subcommands';

const subcommandsPath = path.join(__dirname, '../util');

export const builder = subcommandBuilder(subcommandsPath, "utility", "util commands for Mafia Bot", "util");