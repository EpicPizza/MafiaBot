import fs from 'node:fs';
import path from 'node:path';
import { Global } from './main';
import { CommandOptions } from '../discord';

const extensionsPath = path.join(__dirname, '../extensions');
const extensionFiles = fs.readdirSync(extensionsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
export const extensions = [] as Extension[]; 

interface Extension {
    name: string,
    commandName: string,
    description: string,
    priority: string[],
    help: string,
    commands: CommandOptions[],
    onStart: Function,
    onLock: Function,
    onUnlock: Function,
    onCommand: Function,
    onMessage: Function,
    onEnd: Function,
    onVote: Function
}

for(const file of extensionFiles) {
    const filePath = path.join(extensionsPath, file);
    const extension = require(filePath);

    extensions.push(extension);
}

export async function getEnabledExtensions(global: Global) {
    return extensions.filter(extension => global.extensions.find(enabled => enabled == extension.name));
}