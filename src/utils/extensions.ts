import fs from 'node:fs';
import path from 'node:path';
import { Global } from './main';
import { CommandOptions } from '../discord';

const extensionsPath = path.join(__dirname, '../extensions');
const extensionFiles = fs.readdirSync(extensionsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
export const extensions = [] as Extension[]; 

interface Extension {
    name: string,
    commandName: string | string[],
    emoji: string,
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
    onVote: Function,
    onVotes: Function,
    onHammer: Function,
    onRemove: Function,
}

for(const file of extensionFiles) {
    const filePath = path.join(extensionsPath, file);
    const extension = require(filePath);

    if(extension.name != "Example") extensions.push(extension);
}

export async function getEnabledExtensions(global: Global) {
    return extensions.filter(extension => global.extensions.find(enabled => enabled == extension.name));
}

export function getExtensions(extensionNames: string[]) {
    return extensions.filter(extension => extensionNames.find(enabled => enabled == extension.name));
}