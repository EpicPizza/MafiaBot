import fs from 'node:fs';
import path from 'node:path';

const extensionsPath = path.join(__dirname, '../extensions');
const extensionFiles = fs.readdirSync(extensionsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for(const file of extensionFiles) {
    const filePath = path.join(extensionsPath, file);
    const extension = require(filePath);

    console.log(extension.name);
}