import path from 'node:path';
import { subcommandBuilder } from '../../utils/subcommands';

const subcommandsPath = path.join(__dirname, '../mod');

export const builder = subcommandBuilder(subcommandsPath, "mod", "mod commands for Mafia Bot");