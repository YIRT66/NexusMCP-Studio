import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {git, gitStatus, gitDiff, gitAction, findFiles} from './workbench.mjs';
import {SessionStore} from './session-store.mjs';
import {WorkspaceWatch} from './workspace-watch.mjs';
import {deltaFor, applyDelta, foldRecords} from '../harness/nexus-shell/session-records.mjs';
test('Git 审阅拒绝过期撤销，工作树共享项目记忆且保持独立文件',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-git-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const repo=path.join(directory,'repo');await fs.mkdir(repo);await git(repo,['init']);await git(repo,['config','user.name','Fixture']);await git(repo,['config','user.email','fixture@example.invalid']);
 const file=path.join(repo,'a.txt');await fs.writeFile(file,'base\n');await gitAction(repo,{action:'stage',file},directory);await gitAction(repo,{action:'commit',message:'base'},directory);
 await fs.writeFile(file,'first edit\n');const preview=await gitDiff(repo,file);assert.match(preview.text,/\+first edit/);
 await fs.writeFile(file,'new edit\n');await assert.rejects(gitAction(repo,{action:'discard',file,expectedHash:preview.hash},directory),/重新预览/);assert.equal(await fs.readFile(file,'utf8'),'new edit\n');
 const fresh=await gitDiff(repo,file);await gitAction(repo,{action:'discard',file,expectedHash:fresh.hash},directory);assert.equal(await fs.readFile(file,'utf8'),'base\n');
 await assert.rejects(gitAction(repo,{action:'stage',file:'../outside'},directory),/项目中的文件/);
 const tree=await gitAction(repo,{action:'worktree'},directory);assert.equal(await fs.readFile(path.join(tree.path,'a.txt'),'utf8'),'base\n');
 await fs.writeFile(path.join(tree.path,'a.txt'),'isolated\n');assert.equal((await gitStatus(repo)).files.length,0);
 const store=new SessionStore(directory);await store.init();await store.setMemory('',repo,'shared decision');assert.equal((await store.memory('',tree.path)).notes,'shared decision');
 await fs.mkdir(path.join(repo,'node_modules'));await fs.writeFile(path.join(repo,'node_modules','hidden.txt'),'skip');assert.deepEqual((await findFiles(repo,'a.txt')).files.map(f=>f.relative),['a.txt']);
});
test('外部命令创建的空文件也发出创建通知',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-watch-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 let resolve;const change=new Promise(r=>resolve=r);const watcher=new WorkspaceWatch((_type,value)=>resolve(value));t.after(()=>watcher.close());await watcher.attach(directory);
 const file=path.join(directory,'empty.txt');await fs.writeFile(file,'');
 const result=await Promise.race([change,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('未收到文件通知')),3000);timer.unref();})]);assert.equal(result.path,await fs.realpath(file));assert.equal(result.operation,'created');assert.equal(result.source,'workspace');
});
test('原生日志增量保存不重复整份历史，回放保持顺序和删除',()=>{
 const first={id:'s',title:'original',messages:Array.from({length:1000},(_,i)=>({id:'m'+i,content:'x'.repeat(100)})),calls:[]};
 const seed=deltaFor(null,first),next={...first,title:'next',messages:[...first.messages,{id:'last',content:'finished'}]};
 const delta=deltaFor(first,next);assert.equal(delta.messages.length,1);assert.ok(JSON.stringify(delta).length<JSON.stringify(first).length/10);
 assert.equal(deltaFor(next,next),null);const restored=foldRecords([{type:'plugin:nexus.delta',data:seed},{type:'plugin:nexus.delta',data:delta}]);assert.equal(restored.messages.length,1001);assert.equal(restored.title,'next');
 const removed={...next,messages:next.messages.slice(1)};assert.deepEqual(applyDelta(restored,deltaFor(next,removed)).messages,removed.messages);
});
