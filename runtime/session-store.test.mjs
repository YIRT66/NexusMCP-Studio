import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SessionStore} from './session-store.mjs';
test('本地历史跨重启、并发消息/工具写入、项目记忆隔离和删除墓碑',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-session-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const a=path.join(directory,'a'),b=path.join(directory,'b');await fs.mkdir(a);await fs.mkdir(b);
 const store=new SessionStore(directory);await store.init();await store.sync({workspaces:[{id:'a',path:a,name:'A'},{id:'b',path:b,name:'B'}],sessions:[{id:'one',workspaceId:'a',messages:[],calls:[],title:'first'},{id:'two',workspaceId:'a',messages:[],calls:[]},{id:'other',workspaceId:'b',messages:[],calls:[]}]});
 await Promise.all([store.message({id:'m1',sessionId:'one',role:'user',content:'保留消息',createdAt:1}),store.tool({id:'t1',sessionId:'one',name:'file_write',status:'completed',startedAt:1,endedAt:2})]);
 assert.equal((await store.read('one')).messages.length,1);assert.equal((await store.read('one')).calls.length,1);
 await store.setMemory('one','', '使用 TypeScript');assert.equal((await store.context('two')).projectMemory.notes,'使用 TypeScript');assert.equal((await store.context('other')).projectMemory.notes,'');
 await store.remember({requestId:'turn',sessionId:'one',status:'completed',userText:'完成构建',text:'构建已通过',completedAt:5});assert.equal((await store.memory('two')).tasks.length,1);
 await store.clearMemory('two');assert.equal((await store.memory('one')).notes,'');assert.equal((await store.memory('one')).tasks.length,0);
 const resumed=new SessionStore(directory);await resumed.init();assert.equal((await resumed.read('one')).messages[0].content,'保留消息');const fork=await resumed.fork('one','m1');assert.equal(fork.messages.length,1);assert.equal(fork.parentSessionId,'one');
 await resumed.remove('one');await resumed.sync({workspaces:[],sessions:[{id:'one',messages:[{id:'old',content:'stale'}]}]});assert.equal(await resumed.read('one'),null,'旧浏览器缓存不得恢复已经删除的聊天');
 assert.ok((await fs.readdir(directory)).includes('workspace-state.json.legacy-backup'));
});

test('会话投影损坏时从原生日志恢复，并备份损坏文件',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-recover-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=new SessionStore(directory);await store.init();
 const saved={id:'recover',messages:[{id:'real',role:'assistant',content:'durable'}],calls:[]};await store.put(saved);const file=path.join(store.directory,(await import('node:crypto')).createHash('sha256').update('recover').digest('hex')+'.json');await fs.writeFile(file,'{torn');store.native={read:async id=>id==='recover'?saved:null};assert.deepEqual(await store.read('recover'),saved);assert.equal(await fs.readFile(file+'.corrupt-backup','utf8'),'{torn');
 await store.remove('recover');assert.equal(await store.read('recover'),null,'删除墓碑也必须阻止原生日志自动恢复');
});

test('移除项目后旧缓存不能恢复项目或聊天',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-project-delete-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=new SessionStore(directory);await store.init();const data={workspaces:[{id:'gone',path:directory,name:'Gone'}],sessions:[{id:'chat',workspaceId:'gone',messages:[],calls:[]}]};await store.sync(data);await store.removeWorkspace('gone');await store.sync(data);assert.equal(store.state.workspaces.length,0);assert.equal(await store.read('chat'),null);
});
