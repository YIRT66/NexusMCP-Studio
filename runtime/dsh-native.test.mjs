import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DshRuntime,DSH_VERSION} from './dsh-runtime.mjs';
test('官方 DSH：安装原生 Cordis bundle、启动工作台、卸载和退出清理',{skip:!process.env.NEXUS_DSH_ENGINE_DIR,timeout:180000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-dsh-compat-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const plugin=path.join(directory,'fixture-plugin'),marker=path.join(directory,'native-marker.txt');await fs.mkdir(plugin);
 await fs.writeFile(path.join(plugin,'package.json'),JSON.stringify({name:'nexus-dsh-native-fixture',version:'1.0.0',type:'module',exports:{'./host':'./host.mjs','./cordis.patch.yml':'./cordis.patch.yml'},engines:{dsh:DSH_VERSION},dsh:{bundle:{patch:['./cordis.patch.yml']}}}));
 await fs.writeFile(path.join(plugin,'cordis.patch.yml'),'- insert:\n    - id: nexus-native-fixture\n      name: nexus-dsh-native-fixture/host\n');
 await fs.writeFile(path.join(plugin,'host.mjs'),`import fs from 'node:fs';export const name='nexus-native-fixture';export function apply(ctx){ctx.effect(()=>{fs.writeFileSync(${JSON.stringify(marker)},'mounted');return()=>fs.appendFileSync(${JSON.stringify(marker)},' disposed');});}`);
 const runtime=new DshRuntime(directory);await runtime.init();t.after(()=>runtime.dispose());assert.equal(runtime.info.installed,true);
 const installed=await runtime.plugin({action:'add',spec:'file:'+plugin});assert.ok(installed.some(plugin=>plugin.name==='nexus-dsh-native-fixture'&&plugin.enabled));
 const state=await runtime.start();assert.equal(state.running,true);try{assert.equal(await fs.readFile(marker,'utf8'),'mounted');}catch(error){console.error(runtime.diagnostics);throw error;}const url=new URL(state.url);assert.equal(url.hostname,'127.0.0.1');const response=await fetch(url,{redirect:'manual'});assert.ok([200,302,303].includes(response.status));
 await runtime.stop();assert.equal(runtime.info.running,false);assert.match(await fs.readFile(marker,'utf8'),/disposed/);
 await runtime.plugin({action:'remove',spec:'nexus-dsh-native-fixture'});assert.ok(!(await runtime.plugins()).some(plugin=>plugin.name==='nexus-dsh-native-fixture'));
});
