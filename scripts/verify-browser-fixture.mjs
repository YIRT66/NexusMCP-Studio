import assert from 'node:assert/strict';
// Test driver for the real runtime + browser fixture. A live-provider acceptance
// run must let the model perform these same calls itself.
export async function verifyBrowserFixture(api){
 await api('/webchat/verify',{});
 let context;
 for(let i=0;i<100;i++){const result=await api('/tools/call',{name:'client_session',args:{}});assert.ok(!result.isError,JSON.stringify(result));context=JSON.parse(result.content[0].text);if(context.diagnostic?.challenge&&context.pending.length)break;await new Promise(resolve=>setTimeout(resolve,30));}
 assert.ok(context?.diagnostic?.challenge,'诊断必须通过实际会话工具读取');
 const pending=context.pending.find(r=>r.sessionId===context.activeSessionId);assert.ok(pending);
 for(let i=0;i<100;i++){const state=await api('/webchat');if(state.requestId===pending.requestId||state.busy)break;await new Promise(resolve=>setTimeout(resolve,30));}
 const result=await api('/tools/call',{name:'client_reply',args:{requestId:pending.requestId,sessionId:pending.sessionId,text:context.diagnostic.challenge,done:true}});assert.ok(!result.isError,JSON.stringify(result));
 for(let i=0;i<100;i++){if((await api('/webchat/verify')).phase==='connected')break;await new Promise(resolve=>setTimeout(resolve,30));}
 assert.equal((await api('/webchat/verify')).phase,'connected');
 await api('/webchat/stop',{});
 for(let i=0;i<100;i++){const state=await api('/webchat');if(!state.busy&&!state.pageBusy)break;await new Promise(resolve=>setTimeout(resolve,50));}
 assert.equal(!!(await api('/webchat')).pageBusy,false);
}
