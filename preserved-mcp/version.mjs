import {readFileSync} from 'node:fs';
let manifest;
try{manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));}
catch{manifest=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));}
export const appVersion=manifest.version;
