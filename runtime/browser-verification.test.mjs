import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserVerification} from './browser-verification.mjs';
test('四阶段连接必须先读取诊断并实际回传校验码，不能以网页可输入冒充成功',async()=>{
 const events=[];let sent;const verification=new BrowserVerification({state:()=>({mcp:'running',connected:true,sessionId:'s',ready:true}),publish:(type,data)=>events.push(data),send:async data=>{sent=data;return {requestId:'probe'};}});
 const pending=verification.verify();await Promise.resolve();assert.equal(verification.value.phase,'checking');assert.equal(sent.purpose,'diagnostic');assert.equal(sent.text.includes(verification.pending.challenge),false,'随机答案不能写在测试问题里');
 const challenge=verification.context('s').challenge;verification.receive({purpose:'diagnostic',sessionId:'s',requestId:'probe',content:challenge,done:true});assert.equal((await pending).phase,'connected');assert.equal(verification.value.step,4);
 verification.invalidate();const failed=verification.verify();await Promise.resolve();verification.receive({purpose:'diagnostic',sessionId:'s',requestId:'probe',content:'随便回答',done:true});await assert.rejects(failed,/诊断/);assert.equal(verification.value.phase,'error');
});

test('早到的诊断回传必须等网页发送确认，过期回传保持隐藏',async()=>{
 let dispatched;const ready=new Promise(resolve=>dispatched=resolve);const verification=new BrowserVerification({state:()=>({mcp:'running',connected:true,sessionId:'s',ready:true}),publish:()=>{},send:async()=>{await ready;return {requestId:'current'};}});const promise=verification.verify();const challenge=verification.context('s').challenge;verification.receive({purpose:'diagnostic',sessionId:'s',requestId:'current',content:challenge,done:true});assert.equal(verification.value.phase,'checking');dispatched();assert.equal((await promise).phase,'connected');assert.equal(verification.receive({purpose:'diagnostic',sessionId:'old',requestId:'stale',content:'stale',done:true}),true);
});
