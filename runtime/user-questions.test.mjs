import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {UserQuestions} from './user-questions.mjs';
test('提问保留等待状态、重复调用去重、重启恢复与显式回答',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nexus-questions-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const questions=new UserQuestions(directory);await questions.init();const data={sessionId:'s',requestId:'r',questions:[{id:'style',question:'选择风格',options:[{label:'深色'},{label:'浅色'}]}]};const first=await questions.create(data);assert.equal((await questions.create(data)).id,first.id);
 let settled=false;const waiting=questions.wait(first.id).then(answer=>{settled=true;return answer;});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(settled,false,'不能自动选择默认选项');await assert.rejects(questions.answer(first.id,{}),/全部问题/);
 const reopened=new UserQuestions(directory);await reopened.init();assert.equal(reopened.pending('s').length,1);await questions.answer(first.id,{style:'深色，并减弱动画'});assert.equal((await waiting).answers.style,'深色，并减弱动画');
 const next=await questions.create({...data,requestId:'next'});await questions.cancel('s');assert.equal((await questions.wait(next.id)).status,'cancelled');
});
