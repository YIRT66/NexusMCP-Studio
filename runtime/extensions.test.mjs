import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {Client} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../preserved-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(new URL('../preserved-mcp/package.json',import.meta.url));
const {zipSync,strToU8}=require('fflate');
const WebSocket=require('ws');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const decode=result=>{const text=result.content?.find(c=>c.type==='text')?.text;try{return JSON.parse(text)}catch{return text}};
async function until(callback,ms=30000){const end=Date.now()+ms;while(Date.now()<end){const result=await callback();if(result)return result;await sleep(100)}throw new Error('扩展状态等待超时')}
const fixtureCode=`import readline from 'node:readline'; import {writeFileSync} from 'node:fs'; writeFileSync('fixture.pid',String(process.pid)); const r=readline.createInterface({input:process.stdin}); r.on('line',line=>{const q=JSON.parse(line);if(!('id' in q))return;let result;if(q.method==='initialize')result={protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'真实测试插件',version:'1'}};else if(q.method==='tools/list')result={tools:[{name:'echo',description:'回显输入',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]};else if(q.method==='tools/call')result={content:[{type:'text',text:'插件回显：'+q.params.arguments.text}]};else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n')});`;

test('扩展：本地技能/资源、ZIP、MCP 插件真实挂载、启停、删除和持久化', {timeout:120000}, async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-extensions-test-'));let child,socket,base;const events=[];
 async function launch(){child=fork(path.join(root,'runtime/server.mjs'),[],{cwd:root,env:{...process.env,NEXUS_PORT:'0',NEXUS_DATA_DIR:directory,MCP_NO_TUNNEL:'1'},stdio:['ignore','pipe','pipe','ipc']});let diagnostic='';child.stdout.on('data',c=>diagnostic+=c);child.stderr.on('data',c=>diagnostic+=c);const ready=await new Promise((r,j)=>{const timer=setTimeout(()=>j(new Error(diagnostic)),15000);child.on('message',m=>{if(m.type==='runtime.ready'){clearTimeout(timer);r(m)}});child.once('error',j)});base=ready.url;socket=new WebSocket(base.replace('http:','ws:')+'/ws');socket.on('message',raw=>events.push(JSON.parse(raw.toString())));await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j)})}
 async function shutdown(){socket?.close();if(child?.connected){child.send({type:'shutdown'});await new Promise(r=>{child.once('exit',r);setTimeout(()=>{child.kill();r()},10000).unref()})}}
 await launch();
 const api=async(route,body,method)=>{const response=await fetch(base+'/api'+route,{method:method||(body===undefined?'GET':'POST'),headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(response.status===204)return;const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result};
 const list=async()=> (await api('/extensions')).items;
 const install=async body=>{const result=await api('/extensions/install',body);assert.equal(result.status,'installing');return until(async()=>{const entry=(await list()).find(e=>e.id===result.id);if(entry?.status==='error')throw new Error(entry.error);return entry?.status==='installed'?entry:false})};
 const fixture=createServer((req,res)=>{if(req.url==='/hang'){req.resume();return;}const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{if(req.method!=='POST'){res.statusCode=405;res.end();return}const q=JSON.parse(Buffer.concat(chunks));if(!('id'in q)){res.statusCode=202;res.end();return}const result=q.method==='initialize'?{protocolVersion:q.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'HTTP 测试 MCP',version:'1'}}:q.method==='tools/list'?{tools:[{name:'echo',inputSchema:{type:'object',properties:{text:{type:'string'}}}}]}:{content:[{type:'text',text:'HTTP回显：'+q.params.arguments.text}]};res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}))})});fixture.listen(0,'127.0.0.1');await new Promise(r=>fixture.once('listening',r));
 const client=new Client({name:'扩展集成测试',version:'1'});
 t.after(async()=>{await client.close().catch(()=>{});await shutdown();fixture.closeAllConnections();fixture.close()});
 assert.deepEqual(await list(),[]);
 const skillSource=path.join(directory,'source-skill');await fs.mkdir(path.join(skillSource,'references'),{recursive:true});await fs.writeFile(path.join(skillSource,'SKILL.md'),'---\nname: 中文技能\ndescription: 真实安装的测试技能\n---\n先读取资料，再整理结果。');await fs.writeFile(path.join(skillSource,'references/guide.md'),'资源正文');
 const skill=await install({kind:'skill',source:{type:'local',value:path.join(skillSource,'SKILL.md')}});assert.equal(skill.skillCount,1);assert.equal(skill.enabled,true);
 const pluginSource=path.join(directory,'source-plugin');await fs.mkdir(pluginSource);await fs.writeFile(path.join(pluginSource,'nexus-plugin.json'),JSON.stringify({name:'本地 MCP 插件',version:'1.2.3',mcp:{command:'node',args:['server.mjs']}}));await fs.writeFile(path.join(pluginSource,'server.mjs'),fixtureCode);
 const plugin=await install({kind:'plugin',source:{type:'local',value:pluginSource}});assert.equal(plugin.connected,true);assert.equal(plugin.toolCount,1);
 const pluginDir=path.join(directory,'extensions/packages',plugin.id);const firstPid=Number(await fs.readFile(path.join(pluginDir,'fixture.pid'),'utf8'));assert.ok(firstPid);
 await api('/service/start',{});const boot=await until(async()=>{const b=await api('/bootstrap');return b.service.phase==='running'?b:false});await api('/settings',{mode:'overdrive'});await client.connect(new StreamableHTTPClientTransport(new URL(boot.service.url)));
 const call=(name,args={})=>client.callTool({name,arguments:args},undefined,{timeout:30000});
 const skills=decode(await call('skills_list'));assert.equal(skills.length,1);assert.equal(skills[0].name,'中文技能');assert.match(decode(await call('skill_read',{id:skills[0].id})).content,/先读取资料/);assert.equal(decode(await call('skill_read',{id:skills[0].id,relativePath:'references/guide.md'})).content,'资源正文');assert.equal((await call('skill_read',{id:skills[0].id,relativePath:'../../index.json'})).isError,true);
 let tools=await client.listTools();let external=tools.tools.find(t=>t.name.startsWith('ext_'));assert.ok(external);assert.equal(decode(await call(external.name,{text:'你好'})),'插件回显：你好');
 await api('/extensions/'+plugin.id,{enabled:false},'PATCH');await until(()=>{try{process.kill(firstPid,0);return false}catch{return true}});await until(async()=>!(await client.listTools()).tools.some(t=>t.name===external.name));
 await api('/extensions/'+plugin.id,{enabled:true},'PATCH');await until(async()=> (await list()).find(e=>e.id===plugin.id)?.connected);assert.notEqual(Number(await fs.readFile(path.join(pluginDir,'fixture.pid'),'utf8')),firstPid);
 await api('/extensions/'+skill.id,{enabled:false},'PATCH');await until(async()=>decode(await call('skills_list')).length===0);assert.equal((await call('skill_read',{id:skills[0].id})).isError,true);await api('/extensions/'+skill.id,{enabled:true},'PATCH');await until(async()=>(await list()).find(e=>e.id===skill.id)?.status==='installed');
 const zip=path.join(directory,'skill.zip');await fs.writeFile(zip,zipSync({'wrapper/SKILL.md':strToU8('---\nname: ZIP技能\ndescription: 压缩包技能\n---\n实际解压内容')}));const zipped=await install({kind:'skill',source:{type:'local',value:zip}});assert.equal(zipped.name,'ZIP技能');await api('/extensions/'+zipped.id,undefined,'DELETE');await fs.access(zip);
 const bad=path.join(directory,'bad.zip');await fs.writeFile(bad,zipSync({'../escaped.txt':strToU8('禁止越界')}));const badJob=await api('/extensions/install',{kind:'skill',source:{type:'local',value:bad}});const failed=await until(async()=>{const e=(await list()).find(e=>e.id===badJob.id);return e.status==='error'?e:false});assert.match(failed.error,/不安全/);await assert.rejects(fs.access(path.join(directory,'extensions/packages/escaped.txt')));
 const remote=await install({kind:'mcp',name:'远程 MCP',source:{type:'mcp',value:`http://127.0.0.1:${fixture.address().port}/mcp`}});assert.equal(remote.connected,true);tools=await client.listTools();const httpTool=tools.tools.find(t=>t.description?.includes('[远程 MCP]'));assert.ok(httpTool);assert.notEqual(httpTool.name,external.name);
 await api('/settings',{mode:'safe'});const start=events.length;const pending=call(httpTool.name,{text:'授权后执行'});const approval=await until(()=>events.slice(start).find(e=>e.type==='approval.requested')?.data);await api('/approvals/'+approval.id,{allowed:true});assert.equal(decode(await pending),'HTTP回显：授权后执行');await until(()=>events.some(e=>e.type==='tool.finished'&&e.data.name===httpTool.name));
 await api('/extensions/'+plugin.id,undefined,'DELETE');await assert.rejects(fs.access(pluginDir));await fs.access(path.join(pluginSource,'server.mjs'));
 await client.close();await shutdown();await launch();await until(async()=>(await list()).find(e=>e.id===remote.id)?.connected);const restored=await list();assert.ok(restored.some(e=>e.id===skill.id&&e.enabled));assert.ok(!restored.some(e=>e.id===plugin.id));
 const hanging=await api('/extensions/install',{kind:'mcp',name:'中断连接测试',source:{type:'mcp',value:'http://127.0.0.1:'+fixture.address().port+'/hang'}});await sleep(200);const stopAt=Date.now();await api('/service/stop',{});assert.ok(Date.now()-stopAt<3000,'停止必须中断正在握手的连接');await api('/extensions/'+hanging.id,undefined,'DELETE');console.log(JSON.stringify({localSkill:true,skillResources:true,zip:true,zipTraversalRejected:true,stdioMcp:true,httpMcp:true,remoteApproval:true,processRestart:true,removePreservesSource:true,persistence:true,cancelConnecting:true}));
});
