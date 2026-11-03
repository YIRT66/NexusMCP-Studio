import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SessionStore} from './session-store.mjs';
import {ClientReplies} from './client-replies.mjs';
import {Faults} from './faults.mjs';
test('两端共享会话事件，旧缓存不覆盖新草稿，MCP 无待回复任务也可主动分段发送',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-sync-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const events=[],sessions=new SessionStore(directory,(type,data)=>events.push({type,data}));await sessions.init();await sessions.updateWorkspace({id:'w',path:directory});await sessions.put({id:'s',workspaceId:'w',draft:'新草稿',messages:[],calls:[]});await sessions.select('s');await sessions.sync({workspaces:[],sessions:[{id:'s',draft:'旧缓存',messages:[],calls:[]}]});assert.equal((await sessions.read('s')).draft,'新草稿');assert.ok(events.some(e=>e.type==='session.changed'));assert.ok(events.some(e=>e.type==='selection.changed'));
 const replies=new ClientReplies(directory,(type,data)=>events.push({type,data}));await replies.init();replies.sessions=sessions;const first=await replies.receive({sessionId:'s',text:'主动通知',done:false});await replies.receive({requestId:first.requestId,sessionId:'s',mode:'append',sequence:2,text:'：完成',done:true});assert.equal((await sessions.read('s')).messages.at(-1).content,'主动通知：完成');assert.equal((await sessions.read('s')).messages.filter(m=>m.role==='user').length,0);assert.equal(replies.history('s').length,0);
});
test('故障详情和日志落盘，重新启动保持暂停，手动恢复才解除',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-fault-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const faults=new Faults(directory);await faults.init();await faults.report(new Error('fixture crash Bearer private-token'),'fixture');assert.equal(faults.state.paused,true);assert.match(await faults.logs(),/fixture crash/);assert.equal((await faults.logs()).includes('private-token'),false);const next=new Faults(directory);await next.init();assert.equal(next.state.paused,true);await next.recover();assert.equal(next.state.paused,false);
});
test('守护进程在服务崩溃后只恢复暂停的控制界面，不重放任务',{timeout:20000},async t=>{
 const {fork}=await import('node:child_process');const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-guardian-'));const child=fork(new URL('./guardian.mjs',import.meta.url),[],{env:{...process.env,NEXUS_DATA_DIR:directory,NEXUS_PORT:'0',MCP_NO_TUNNEL:'1'},stdio:['ignore','pipe','pipe','ipc']});child.stdout.resume();child.stderr.resume();t.after(async()=>{if(child.connected){child.send({type:'shutdown'});await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill();resolve();},6000).unref();});}await fs.rm(directory,{recursive:true,force:true});});const ready=await new Promise(resolve=>child.once('message',resolve));const before=await fetch(ready.url+'/api/diagnostics').then(r=>r.json());const restarted=new Promise(resolve=>child.on('message',m=>{if(m.type==='runtime.ready')resolve(m);}));process.kill(before.pid,'SIGKILL');const after=await restarted;assert.equal(after.port,ready.port);const fault=await fetch(after.url+'/api/diagnostics').then(r=>r.json());assert.equal(fault.paused,true);const denied=await fetch(after.url+'/api/service/start',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(denied.status,503);
});
