import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const packageRoot=path.resolve(fileURLToPath(new URL('../release/NexusMCP-Service',import.meta.url)));
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-package-test-'));
const child=spawn(path.join(packageRoot,'preserved-mcp/runtime/'+(process.platform==='win32'?'node.exe':'node')),[path.join(packageRoot,'runtime/server.mjs')],{cwd:directory,windowsHide:true,env:{...process.env,NEXUS_DATA_DIR:directory,NEXUS_PORT:'0',MCP_NO_TUNNEL:'1'},stdio:['ignore','pipe','pipe','ipc']});
let diagnostic='';child.stdout.on('data',c=>diagnostic+=c);child.stderr.on('data',c=>diagnostic+=c);
try{
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(diagnostic)),15000);child.on('message',m=>{if(m.type==='runtime.ready'){clearTimeout(timer);resolve(m)}});child.once('error',reject);child.once('exit',code=>reject(new Error('包内进程退出 '+code+diagnostic)))});
 const api=async(route,body)=>{const r=await fetch(ready.url+'/api'+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value};
 assert.equal((await api('/health')).service,'nexus-local-runtime');await api('/service/start',{});
 let boot;for(let i=0;i<100;i++){boot=await api('/bootstrap');if(boot.service.phase==='running')break;if(boot.service.phase==='error')throw new Error(boot.service.error);await new Promise(r=>setTimeout(r,100))}
 assert.equal(boot.service.phase,'running');assert.ok(boot.tools.some(t=>t.name==='skill_read'));assert.ok(boot.tools.some(t=>t.name==='file_patch'));
 const terminal=await api('/tools/call',{name:'terminal_create',args:{}});assert.ok(!terminal.isError);assert.ok(JSON.parse(terminal.content[0].text).id);
 const skillSource=path.join(directory,'source-skill');await fs.mkdir(skillSource);await fs.writeFile(path.join(skillSource,'SKILL.md'),'---\nname: 打包验证技能\ndescription: 验证独立服务包安装器\n---\n实际安装内容');
 const installed=await api('/extensions/install',{kind:'skill',source:{type:'local',value:skillSource}});
 let entry;for(let i=0;i<100;i++){entry=(await api('/extensions')).items.find(e=>e.id===installed.id);if(entry.status==='installed')break;if(entry.status==='error')throw new Error(entry.error);await new Promise(r=>setTimeout(r,100))}assert.equal(entry.status,'installed');
 const skillList=await api('/tools/call',{name:'skills_list',args:{}});assert.equal(JSON.parse(skillList.content[0].text)[0].name,'打包验证技能');
 const badWindow=await api('/tools/call',{name:'window_control',args:{handle:'0',operation:'focus'}});assert.equal(badWindow.isError,true);assert.match(badWindow.content[0].text,/窗口句柄无效/);
 await api('/service/stop',{});assert.equal((await api('/bootstrap')).service.phase,'stopped');
 console.log(JSON.stringify({packagedRuntime:true,tools:boot.tools.length,nativePty:true,platform:process.platform,packagedInstaller:true,independentWorkingDirectory:true}));
}finally{if(child.connected){child.send({type:'shutdown'});await new Promise(r=>{child.once('exit',r);setTimeout(()=>{child.kill();r()},8000).unref()})}}
