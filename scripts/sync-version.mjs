import {promises as fs} from 'node:fs';
const root=new URL('../',import.meta.url);
const {version}=JSON.parse(await fs.readFile(new URL('package.json',root),'utf8'));
for(const relative of ['frontend/package.json','preserved-mcp/package.json','browser-plugin/manifest.json','harness/nexus-shell/package.json','harness/whale-adapter/package.json']){const file=new URL(relative,root);const value=JSON.parse(await fs.readFile(file,'utf8'));if(value.version!==version){value.version=version;await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');}}
for(const relative of ['package-lock.json','preserved-mcp/package-lock.json']){const file=new URL(relative,root);const value=JSON.parse(await fs.readFile(file,'utf8'));value.version=version;if(value.packages?.[''])value.packages[''].version=version;if(value.packages?.frontend)value.packages.frontend.version=version;await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');}
