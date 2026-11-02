import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {createRequire} from 'node:module';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const {WebSocket}=createRequire(new URL('../preserved-mcp/package.json',import.meta.url))('ws');
async function until(callback){for(let i=0;i<200;i++){const result=await callback();if(result)return result;await new Promise(r=>setTimeout(r,25));}throw new Error('等待浏览器桥接状态超时');}
test('DeepSeek 扩展通道：实际文件工具、审批、回传结果、重复调用与最终正文',{timeout:20000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-browser-tools-'));const child=fork(fileURLToPath(new URL('./server.mjs',import.meta.url)),[],{env:{...process.env,NEXUS_DATA_DIR:dir,NEXUS_PORT:'0',MCP_NO_TUNNEL:'1'},stdio:['ignore','pipe','pipe','ipc']});let diagnostic='';child.stderr.on('data',c=>diagnostic+=c);
 let socket;t.after(async()=>{socket?.close();if(child.connected){child.send({type:'shutdown'});await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},7000).unref();});}await fs.rm(dir,{recursive:true,force:true});});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(diagnostic)),10000);child.on('message',m=>{if(m.type==='runtime.ready'){clearTimeout(timer);resolve(m);}});});
 const api=async(url,body)=>{const res=await fetch(ready.url+'/api'+url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await res.json();assert.ok(res.ok,JSON.stringify(value));return value;};
 await api('/service/start',{});await until(async()=>(await api('/bootstrap')).service.phase==='running');
 const bridge=await api('/webchat/bridge');socket=new WebSocket(bridge.url,{origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 const commands=[];socket.on('message',raw=>{const command=JSON.parse(raw);commands.push(command);if(command.id)socket.send(JSON.stringify({type:'result',id:command.id,result:{sent:true}}));});
 const event=(type,data)=>socket.send(JSON.stringify({type:'event',event:{type,data}}));event('webchat.state',{provider:'deepseek',sessionId:'s',providers:[],ready:true,busy:false});await until(async()=>(await api('/webchat')).provider==='deepseek');
 const request=await api('/webchat/send',{sessionId:'s',text:'写入测试文件',permission:'workspace'});const sent=commands.find(c=>c.operation==='send');assert.equal(sent.data.toolBridge,true);assert.ok(sent.data.toolCatalog.some(t=>t.name==='file_patch_many'));
 const target=path.join(dir,'bridge.txt');const call={protocol:'nexus-tool-v1',requestId:request.requestId,sessionId:'s',calls:[{id:'write-1',name:'file_write',args:{path:target,content:'扩展调用成功'}}]};event('webchat.tools',call);
 const approval=await until(async()=>(await api('/bootstrap')).approvals[0]);assert.equal(approval.origin,'browser');await assert.rejects(fs.access(target));await api('/approvals/'+approval.id,{allowed:true});
 await until(()=>commands.find(c=>c.operation==='tools.result'));assert.equal(await fs.readFile(target,'utf8'),'扩展调用成功');
 event('webchat.tools',call);await until(()=>commands.filter(c=>c.operation==='tools.result').length===2);assert.equal((await api('/bootstrap')).calls.filter(c=>c.name==='file_write').length,1);
 event('webchat.reply',{requestId:request.requestId,sessionId:'s',provider:'deepseek',text:'已完成，结果已在软件内显示。',done:true});await until(async()=>(await api('/bootstrap')).clientReplies.some(m=>m.content.includes('软件内显示')&&m.done));
});
