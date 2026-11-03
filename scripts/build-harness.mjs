import {build} from 'esbuild';
import {promises as fs} from 'node:fs';
if(process.env.VITE_WEB_PREVIEW==='true'){console.log('Static preview: native backend bundle is not required.');process.exit(0);}
const {version}=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
await build({entryPoints:['frontend/src/harness-entry.tsx'],bundle:true,format:'cjs',platform:'browser',outfile:'harness/nexus-shell/client.js',external:['react','react/*','react-dom','react-dom/*','@deepseek-ai/cordis'],loader:{'.svg':'dataurl','.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"','import.meta.env.BASE_URL':'"/"','import.meta.env.VITE_WEB_PREVIEW':'"false"','import.meta.env.VITE_APP_VERSION':JSON.stringify(version),'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},banner:{js:'window.__ModuleLoader__.load({id:"nexus-studio-shell",factory:(require)=>{const module={exports:{}};const exports=module.exports;'},footer:{js:'return module.exports;}});'},minify:true,jsx:'automatic',logLevel:'warning'});
const upstream=await fs.readFile('preserved-mcp/node_modules/dsh-whale-musume/lib/client.js','utf8');
if(!/id:\s*["']dsh-whale-musume["']/.test(upstream))throw new Error('Upstream whale loader changed; review adapter before building');
await fs.writeFile('harness/whale-adapter/client.js',upstream.replace(/id:\s*["']dsh-whale-musume["']/,'id:"nexus-certified-whale"'));
await fs.copyFile('preserved-mcp/node_modules/dsh-whale-musume/LICENSE','harness/whale-adapter/UPSTREAM-LICENSE');
console.log('Built native Cordis shell and pinned whale adapter.');
