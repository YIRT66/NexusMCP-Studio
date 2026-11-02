import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {ExtensionManager} from './extensions.mjs';import {StudioHost} from './studio-host.mjs';import {fileURLToPath} from 'node:url';
test('全权 Studio 扩展：实际安装、动态工具、中间件、前端资源、禁用清理与重新启用',{timeout:20000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-studio-host-'));const events=[];const host=new StudioHost({emit:(...event)=>events.push(event),callTool:async()=>({})});const manager=new ExtensionManager(dir);manager.studioHost=host;t.after(async()=>{await manager.dispose();await fs.rm(dir,{recursive:true,force:true});});await manager.init();
 const entry=await manager.install({kind:'plugin',source:{type:'local',value:fileURLToPath(new URL('../examples/studio-delight',import.meta.url))}});
 for(let i=0;i<100;i++){const value=manager.get(entry.id);if(value.status==='error')throw new Error(value.error);if(value.status==='installed')break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(manager.get(entry.id).status,'installed');const tool=manager.toolManifest().find(tool=>tool.name.includes('workspace_pulse'));assert.ok(tool);const first=await manager.call(tool.name,{});assert.equal(JSON.parse(first.content[0].text).calls,0);
 await host.invoke({name:'file_read'},async()=>({content:[]}));assert.equal(JSON.parse((await manager.call(tool.name,{})).content[0].text).calls,1);
 assert.match(await host.asset(manager.get(entry.id),'ui.mjs'),/ui\.mjs$/);await assert.rejects(host.asset(manager.get(entry.id),'../../index.json'),/越界/);
 await manager.enable(entry.id,false);assert.equal(host.manifest().length,0);assert.equal(host.hooks.size,0);
 await manager.enable(entry.id,true);for(let i=0;i<100&&!host.manifest().length;i++)await new Promise(r=>setTimeout(r,30));assert.ok(host.manifest().length);await manager.remove(entry.id);assert.equal(host.active.size,0);
});
