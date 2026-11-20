import path from 'node:path';
import { subcommandBuilder } from '../../utils/subcommands';

const subcommandsPath = path.join(__dirname, '../asset');

export const builder = subcommandBuilder(subcommandsPath, "asset", "rolecard/item images and videos; public ones anyone can view, private ones mods only");
