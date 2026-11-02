import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {workspaceRead,workspaceBatch} from '../preserved-mcp/workspace.mjs';import {runCommand,cancelCommands} from '../preserved-mcp/commands.mjs';
test('项目快照：分页覆盖所有源码，字节限额、忽略依赖和真实批量增删行',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-workspace-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'node_modules'));await fs.writeFile(path.join(dir,'node_modules','ignored.js'),'ignored');
 for(let i=0;i<13;i++)await fs.writeFile(path.join(dir,`source-${i}.js`),'x'.repeat(900));
 const seen=[];let cursor=0;do{const page=await workspaceRead({path:dir,cursor,maxBytes:2000,maxFiles:4,maxFileBytes:1500});assert.ok(page.bytes<=2000);seen.push(...page.files.map(f=>f.path));cursor=page.nextCursor;}while(cursor!==null);
 assert.equal(new Set(seen).size,13);assert.equal(seen.length,13);assert.ok(!seen.some(file=>file.includes('node_modules')));
 const target=path.join(dir,'output','new.txt');const result=await workspaceBatch({steps:[{action:'mkdir',path:path.dirname(target)},{action:'write',path:target,content:'one\ntwo\n'},{action:'patch',path:target,edits:[{oldText:'two',newText:'second\nthird'}]},{action:'patch',path:target,edits:[{oldText:'missing',newText:'fail'}]},{action:'write',path:target,content:'must not write'}]});assert.equal(result.ok,false);assert.equal(result.completed,4);assert.equal(await fs.readFile(target,'utf8'),'one\nsecond\nthird\n');assert.equal(result.results[2].result.addedLines,2);assert.equal(result.results[2].result.removedLines,1);
});
test('一次性命令：真实退出码、输出截断、超时及请求取消',{skip:process.platform!=='linux',timeout:10000},async()=>{
 const ok=await runCommand({command:"printf '中文'; exit 7"});assert.equal(ok.stdout,'中文');assert.equal(ok.exitCode,7);
 const timeout=await runCommand({command:'sleep 20',timeoutMs:100});assert.equal(timeout.timedOut,true);assert.notEqual(timeout.exitCode,0);
 const pending=runCommand({command:'sleep 20'},'cancel-fixture');setTimeout(()=>cancelCommands('cancel-fixture'),80);assert.equal((await pending).cancelled,true);
 const limited=await runCommand({command:"printf '12345678901234567890'",maxOutput:8});assert.equal(limited.stdout.length,8);assert.equal(limited.truncated,true);
});
