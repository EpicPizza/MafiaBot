import path from 'node:path';
import { subcommandBuilder } from '../../utils/subcommands';

const subcommandsPath = path.join(__dirname, '../advance');

export const builder = subcommandBuilder(subcommandsPath, "advance", "advance only commands", "adv");