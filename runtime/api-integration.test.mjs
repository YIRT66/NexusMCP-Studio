import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {createServer} from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
async function until(callback){for(let i=0;i<200;i++){const result=await callback();if(result)return result;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('等待 API 集成状态超时');}
test('API 模型通过实际 MCP 工具调用执行，审批取消后不再写入',{timeout:30000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-api-integration-')),target=path.join(directory,'approved.txt');
 const fixture=createServer(async(request,response)=>{let text='';for await(const chunk of request)text+=chunk;const body=JSON.parse(text),tool=body.messages.at(-1).role==='tool';response.writeHead(200,{'content-type':'text/event-stream'});const packet=tool?{choices:[{delta:{content:'文件已按授权写入。'},finish_reason:'stop'}]}:{choices:[{delta:{tool_calls:[{index:0,id:'write-call',type:'function',function:{name:'file_write',arguments:JSON.stringify({path:target,content:'审批后写入的中文'})}}]},finish_reason:'tool_calls'}]};response.end('data: '+JSON.stringify(packet)+'\n\ndata: [DONE]\n\n');});
 await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));t.after(()=>{fixture.closeAllConnections();fixture.close();});
 const child=fork(path.join(root,'runtime/server.mjs'),[],{env:{...process.env,NEXUS_DATA_DIR:directory,NEXUS_PORT:'0',MCP_NO_TUNNEL:'1'},stdio:['ignore','pipe','pipe','ipc']});let diagnostic='';child.stdout.on('data',value=>diagnostic+=value);child.stderr.on('data',value=>diagnostic+=value);
 t.after(async()=>{if(child.connected){child.send({type:'shutdown'});await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},7000).unref();});}await fs.rm(directory,{recursive:true,force:true});});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(diagnostic)),10000);child.on('message',message=>{if(message.type==='runtime.ready'){clearTimeout(timer);resolve(message);}});child.once('error',reject);});
 const api=async(route,body)=>{const response=await fetch(ready.url+'/api'+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;};
 await api('/service/start',{});await until(async()=>(await api('/bootstrap')).service.phase==='running');
 const profile=await api('/model-profiles',{name:'审批测试模型',model:'fixture',baseUrl:`http://127.0.0.1:${fixture.address().port}/v1`,apiKey:'integration-secret'});
 await api('/chat/send',{sessionId:'api-session',profileId:profile.id,text:'请求写文件',permission:'workspace'});
 const approval=await until(async()=>(await api('/bootstrap')).approvals[0]);assert.equal(approval.origin,'api');assert.equal(approval.sessionId,'api-session');await assert.rejects(fs.access(target));
 await api('/chat/stop',{sessionId:'api-session'});await until(async()=>(await api('/bootstrap')).approvals.length===0);await assert.rejects(fs.access(target));
 await until(async()=>{const state=await api('/bootstrap');return !state.apiChats['api-session'].busy;});
 // A stopped request must settle before accepting another model run.
 await new Promise(resolve=>setTimeout(resolve,100));
 await api('/chat/send',{sessionId:'api-session',profileId:profile.id,text:'再次请求写文件',permission:'workspace'});
 const next=await until(async()=>(await api('/bootstrap')).approvals[0]);await api('/approvals/'+next.id,{allowed:true});
 await until(async()=>(await api('/bootstrap')).clientReplies.some(message=>message.source==='api'&&message.done&&message.content.includes('授权')));
 assert.equal(await fs.readFile(target,'utf8'),'审批后写入的中文');const boot=await api('/bootstrap');assert.ok(boot.calls.some(call=>call.source==='API 模型'&&call.sessionId==='api-session'&&call.requestId));assert.equal(JSON.stringify(boot).includes('integration-secret'),false);
});
