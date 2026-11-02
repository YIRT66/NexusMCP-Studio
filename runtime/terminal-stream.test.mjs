import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {registerTools,disposeTools} from '../preserved-mcp/tools.mjs';
import {inContext} from '../preserved-mcp/policy.mjs';
const {z}=createRequire(new URL('../preserved-mcp/package.json',import.meta.url))('zod');
test('PTY：增量分页、即时返回、中断前台任务且保留 shell、退出唤醒读取',{skip:process.platform!=='linux',timeout:15000},async t=>{
 const registry=new Map();registerTools({registerTool:(name,config,handler)=>registry.set(name,{handler,schema:z.object(config.inputSchema)})});t.after(disposeTools);
 const call=async(name,args)=>{const tool=registry.get(name);const result=await inContext('local',()=>tool.handler(tool.schema.parse(args)));assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
 const {id}=await call('terminal_create',{});let cursor=0,buffer='';
 const until=async pattern=>{for(let i=0;i<50;i++){const result=await call('terminal_read',{id,cursor,waitMs:100});cursor=result.nextCursor;buffer+=result.output;if(pattern.test(buffer))return;}assert.fail(buffer);};
 await call('terminal_write',{id,data:"printf 'NEXUS_READY\\n'\r"});await until(/NEXUS_READY/);await new Promise(r=>setTimeout(r,100));const initial=await call('terminal_read',{id,cursor,waitMs:0});cursor=initial.nextCursor;
 const started=Date.now();const waiting=call('terminal_read',{id,cursor,waitMs:5000});setTimeout(()=>void call('terminal_write',{id,data:"printf 'NEXUS_WAKE\\n'\r"}),80);const output=await waiting;assert.ok(Date.now()-started<2000);cursor=output.nextCursor;
 await call('terminal_write',{id,data:'sleep 10\r'});await new Promise(r=>setTimeout(r,150));await call('terminal_signal',{id,signal:'interrupt'});await call('terminal_write',{id,data:"printf 'NEXUS_ALIVE\\n'\r"});await until(/NEXUS_ALIVE/);
 await call('terminal_write',{id,data:"printf '1234567890\\n'\r"});await new Promise(r=>setTimeout(r,100));const first=await call('terminal_read',{id,cursor,limit:5,waitMs:0});assert.equal(first.output.length,5);assert.equal(first.hasMore,true);const second=await call('terminal_read',{id,cursor:first.nextCursor,limit:5,waitMs:0});assert.equal(second.nextCursor,first.nextCursor+5);
 await call('terminal_close',{id});
});
