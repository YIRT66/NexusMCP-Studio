import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../frontend/src/trajectory.ts',import.meta.url),'utf8');const exports={};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const {trajectoryRecords,trajectoryTurns,projectTrajectory,recordDuration}=exports;
test('时间轴保留真实计时、请求轮次、并发工具和未记录的结束时间',()=>{
 const messages=[{id:'u1',requestId:'r1',role:'user',content:'第一轮',createdAt:1000},{id:'a1',requestId:'r1',role:'assistant',content:'正在回复',createdAt:1100,firstTokenAt:1500,done:false},{id:'u2',requestId:'r2',role:'user',content:'第二轮',createdAt:2000},{id:'a2',requestId:'r2',role:'assistant',content:'已完成',createdAt:2100,completedAt:2400,done:true}];
 const calls=[{id:'tool1',requestId:'r1',name:'read',input:{path:'README.md'},output:'输出里可搜索',status:'completed',startedAt:1300,endedAt:1600},{id:'tool2',requestId:'r1',name:'late_tool',input:{},status:'running',startedAt:2300}];
 const records=trajectoryRecords(messages,calls,[]),turns=trajectoryTurns(records);assert.equal(turns.length,2);assert.ok(turns[0].records.some(record=>record.id==='tool2'));assert.equal(recordDuration(records.find(record=>record.id==='a1')),null);assert.equal(recordDuration(records.find(record=>record.id==='a2')),300);assert.ok(records.find(record=>record.id==='tool1').search.includes('输出里可搜索'));
 const projection=projectTrajectory(records,'clock');assert.equal(projection.start,1000);assert.equal(projection.end,2400);assert.equal(projection.blocks.find(block=>block.record.id==='tool2').duration,null);
 const compressed=projectTrajectory(records,'duration');assert.ok(compressed.span<projection.span);assert.ok(compressed.blocks.find(block=>block.record.id==='tool2').start<compressed.blocks.find(block=>block.record.id==='a2').end);
 const unknown=trajectoryRecords([{id:'old',role:'assistant',content:'没有时间戳的旧消息'}],[],[])[0];assert.equal(unknown.at,null);assert.equal(unknown.end,null);assert.equal(projectTrajectory([unknown],'clock').blocks[0].start,null);
});
