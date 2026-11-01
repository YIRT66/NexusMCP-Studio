import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { zipSync, strToU8 } = require('fflate');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'browser-plugin');
const files = {};
for (const name of await fs.readdir(directory)) {
  if ((await fs.stat(path.join(directory, name))).isFile()) files[name] = strToU8(await fs.readFile(path.join(directory, name), 'utf8'));
}
const output = path.join(root, 'release', 'NexusMCP-Browser-Extension.zip');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, zipSync(files));
console.log(output);
