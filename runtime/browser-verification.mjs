import {randomBytes} from 'node:crypto';
export class BrowserVerification {
 constructor({send,state,publish,replies,stop,complete}){Object.assign(this,{send,state,publish,replies,stop,complete});this.value={phase:'idle',step:0,error:''};this.pending=null;}
 snapshot(){return {...this.value};}
 update(patch){this.value={...this.value,...patch};this.publish('webchat.verification',this.snapshot());}
 invalidate(reason='网页连接已变化'){if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error(reason));void this.replies?.cancel(this.pending.sessionId);this.pending=null;}this.update({phase:'idle',step:0,error:reason,verifiedAt:undefined});}
 async verify(){if(this.pending)return this.pending.promise;const state=this.state();if(state.mcp!=='running')throw new Error('MCP 服务尚未启动');if(!state.connected)throw new Error('浏览器控制通道尚未连接');if(!state.sessionId||!state.ready)throw new Error('请先绑定当前网页并完成登录');
  this.update({phase:'checking',step:3,error:''});const challenge=randomBytes(16).toString('hex');let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  const timer=setTimeout(()=>{if(!this.pending)return;this.pending=null;void this.replies.cancel(state.sessionId);void this.stop?.().catch(()=>{});this.update({phase:'error',step:3,error:'实际对话自检超时：请确认当前网页已启用 MCP 或浏览器工具协议，再重试。'});reject(new Error(this.value.error));},120000);timer.unref?.();
  this.pending={promise,resolve,reject,timer,challenge,read:false,dispatched:false,sessionId:state.sessionId};
  try{const request=await this.send({sessionId:state.sessionId,purpose:'diagnostic',text:'这是 NexusMCP 连接诊断，不是用户任务。只调用 client_session，读取 diagnostic.challenge；然后用 client_reply 将该 challenge 原样回传，done=true。不要运行命令、修改文件、读取项目记忆或输出其他文字。'});if(this.pending){this.pending.requestId=request.requestId;this.pending.dispatched=true;if(this.pending.earlyReply)this.receive(this.pending.earlyReply);}}catch(error){clearTimeout(timer);this.pending=null;this.update({phase:'error',step:3,error:error.message});reject(error);}
  return promise;
 }
 context(sessionId){if(!this.pending||sessionId!==this.pending.sessionId)return undefined;this.pending.read=true;return {challenge:this.pending.challenge,instructions:'用 client_reply 原样返回 challenge，不执行其他操作。'};}
 receive(message){const pending=this.pending;if(message.purpose!=='diagnostic')return false;if(!pending||message.sessionId!==pending.sessionId)return true;if(!message.done)return true;if(!pending.dispatched){pending.earlyReply=message;return true;}if(message.requestId!==pending.requestId)return true;clearTimeout(pending.timer);this.pending=null;if(pending.read&&message.content.trim()===pending.challenge){this.update({phase:'connected',step:4,error:'',verifiedAt:Date.now()});pending.resolve(this.snapshot());this.complete?.(message,true);}else{this.update({phase:'error',step:3,error:'诊断未通过：没有先读取会话诊断或返回的校验码不匹配。'});pending.reject(new Error(this.value.error));this.complete?.(message,false);}return true;}
 close(){this.invalidate('运行时已停止');}
}
