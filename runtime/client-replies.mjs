import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const replyInstructions = '用户消息带有 NexusMCP requestId/sessionId 时，优先调用 client_reply 返回 Markdown 回答，标识使用消息中的原值。';
export class ClientReplies {
  constructor(directory, publish, onReply = () => {}) { this.file = path.join(directory, 'client-replies.json'); this.requests = []; this.publish = publish; this.onReply = onReply; this.activeSessionId = ''; this.persist = Promise.resolve(); }
  async init() {
    try { const saved = JSON.parse(await fs.readFile(this.file, 'utf8')); this.requests = Array.isArray(saved) ? saved : []; for (const request of this.requests) if (['sending', 'waiting', 'replying'].includes(request.status)) {request.status = 'interrupted';request.completedAt=Date.now();} }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async save() { const snapshot = JSON.stringify(this.requests.filter(r=>r.purpose!=='diagnostic')); this.persist = this.persist.catch(() => {}).then(async () => { const temp = this.file + '.tmp'; await fs.writeFile(temp, snapshot, { mode: 0o600 }); await fs.rename(temp, this.file); }); return this.persist; }
  context() { return { replyTool: 'client_reply', replyMode: 'mcp', activeSessionId: this.activeSessionId||this.sessions?.state.activeSessionId||'', pending: this.requests.filter(request => request.mode !== 'api' && request.purpose!=='notification' && ['sending', 'waiting', 'replying'].includes(request.status)).map(({ requestId, sessionId, status, createdAt, provider }) => ({ requestId, sessionId, status, createdAt, provider })), instructions: replyInstructions }; }
  activity(request){return {sessionId:request.sessionId,requestId:request.requestId,startedAt:request.createdAt,completedAt:request.completedAt,busy:['sending','waiting','replying'].includes(request.status),status:request.status,external:request.external===true};}
  activities(){return Object.fromEntries(this.requests.filter(r=>r.mode!=='api'&&!['diagnostic','notification'].includes(r.purpose)).map(r=>[r.sessionId,this.activity(r)]));}
  publishActivity(request){if(request.mode!=='api'&&!['diagnostic','notification'].includes(request.purpose))this.publish('client.reply-state',this.activity(request));}
  async begin({sessionId,requestId,turnId,userText='',provider='MCP 网页'}={}){
    sessionId=sessionId||this.activeSessionId||this.sessions?.state.activeSessionId;
    const session=await this.sessions?.read(sessionId||'');if(!session)throw new Error('请先 client_session 查询并指定有效 sessionId');
    let request=requestId?this.requests.find(r=>r.requestId===requestId):turnId?this.requests.find(r=>r.sessionId===sessionId&&r.clientTurnId===turnId):this.requests.find(r=>r.sessionId===sessionId&&r.mode!=='api'&&!['diagnostic','notification'].includes(r.purpose)&&['sending','waiting','replying'].includes(r.status));
    if(requestId&&!request)throw new Error('requestId 不存在');
    if(request&&(request.sessionId!==sessionId||request.mode==='api'||['diagnostic','notification'].includes(request.purpose)))throw new Error('回复头与目标会话不匹配');
    if(!request){
      if(this.requests.some(r=>r.sessionId===sessionId&&!['diagnostic','notification'].includes(r.purpose)&&['sending','waiting','replying'].includes(r.status)))throw new Error('当前会话已有任务，请使用其 requestId');
      request={requestId:randomUUID(),sessionId,clientTurnId:turnId,external:true,provider,source:'MCP 网页',mode:'mcp',purpose:'conversation',workspace:session.workspacePath||this.sessions.state.workspaces.find(w=>w.id===session.workspaceId)?.path||'',permission:session.permission||'workspace',userText,text:'',createdAt:Date.now(),status:'waiting',sequence:0,lastOperation:''};
      this.requests.push(request);this.activeSessionId=sessionId;
      if(userText){await this.sessions.attach(request);this.publish('message.upsert',{id:request.requestId+':user',role:'user',sessionId,requestId:request.requestId,content:userText,source:'MCP 网页',createdAt:request.createdAt});}
      await this.save();
    }
    request.replyHeader=true;const message=this.message(request);await this.sessions.message(message);this.publish('message.upsert',message);this.publishActivity(request);
    return {requestId:request.requestId,sessionId,startedAt:request.createdAt,status:request.status,done:message.done,replyTool:'client_reply',instructions:'后续 client_reply 使用此 requestId/sessionId；结束时 done=true。计时从回复头工具首次调用开始，重复调用不重置。'};
  }
  async create(data) {
    if (typeof data.sessionId !== 'string' || !data.sessionId || data.sessionId.length > 150) throw new Error('缺少有效的客户端 sessionId');
    if (this.requests.some(request => request.sessionId === data.sessionId && request.purpose!=='notification' && ['sending', 'waiting', 'replying'].includes(request.status))) throw new Error('当前会话仍在等待回复，请等待或停止');
    const request = { requestId: randomUUID(), sessionId: data.sessionId, provider: data.provider || 'chatgpt', model: data.model, clientTurnId:data.clientTurnId,toolBridge:data.toolBridge===true,workspace:data.workspace||'',purpose:data.purpose||'conversation',reasoning:'',reasoningStatus:'idle',reasoningEffort:data.reasoningEffort||'default',permission:data.permission || 'workspace', sharedAccessId:data.sharedAccessId,mode: data.mode === 'api' ? 'api' : 'mcp', createdAt: Date.now(), status: 'sending', text: '', userText: data.text, sequence: 0, lastOperation: '' };
    this.activeSessionId = data.sessionId; this.requests.push(request); await this.save();await this.sessions?.attach(request);return request;
  }
  message(request) { return { id: 'mcp_' + request.requestId, role: 'assistant', content: request.text, reasoning:request.reasoning||'',reasoningStatus:request.reasoningStatus||'idle',reasoningStartedAt:request.reasoningStartedAt,reasoningCompletedAt:request.reasoningCompletedAt,purpose:request.purpose,reasoningEffort:request.reasoningEffort, sessionId: request.sessionId, provider: request.provider, model: request.model, requestId: request.requestId, source: request.source || (request.mode === 'api' ? 'api' : 'MCP'), createdAt: request.createdAt, firstTokenAt: request.firstTokenAt, completedAt: request.completedAt,requestStartedAt:request.createdAt, updatedAt: request.updatedAt, usage: request.usage, status: request.status, done: !['sending', 'waiting', 'replying'].includes(request.status), sequence: request.sequence }; }
  async sent(request) {
    if (request.status === 'sending') request.status = 'waiting'; await this.save();
    if(request.purpose==='diagnostic')return;
    this.publishActivity(request);
    this.publish('message.upsert', { id: request.requestId + ':user', role: 'user', sessionId: request.sessionId, provider: request.provider, content: request.userText, requestId: request.requestId, createdAt: request.createdAt });
    this.publish('client.request', { requestId: request.requestId, sessionId: request.sessionId, status: request.status, replyMode: request.mode });
  }
  async failed(request, error) { if (['completed', 'cancelled'].includes(request.status)) return; request.status = 'failed'; request.error = String(error.message || error); request.completedAt = Date.now();this.publishActivity(request); await this.save(); this.publish('client.failed', { sessionId: request.sessionId, requestId: request.requestId, error: request.error }); if(request.text||request.external||request.replyHeader){const message=this.message(request);await this.sessions?.message(message);this.publish('message.upsert',message);} this.publish('agent.status', { phase: 'idle', sessionId: request.sessionId }); }
  async cancel(sessionId,requestId) { for (const request of this.requests) if ((!sessionId || request.sessionId === sessionId) && (!requestId||request.requestId===requestId) && ['sending', 'waiting', 'replying'].includes(request.status)) { request.status = 'cancelled'; request.completedAt = Date.now();this.publishActivity(request); if(request.text||request.external||request.replyHeader){const message=this.message(request);await this.sessions?.message(message);this.publish('message.upsert',message);} } await this.save(); this.publish('agent.status', { phase: 'idle', sessionId }); }
  async receiveBrowser(args) {
    const request = this.requests.find(request => request.requestId === args.requestId);
    if (!request || request.mode === 'api' || request.sessionId !== args.sessionId || request.provider !== args.provider) throw new Error('网页回复与当前请求不匹配');
    if (request.status === 'completed') return { received: true, duplicate: true, requestId: request.requestId, sessionId: request.sessionId, done: true };
    return this.receive(args, { source: 'browser' });
  }
  async receive(args, metadata = {}) {
    let request = args.requestId ? this.requests.find(request => request.requestId === args.requestId) : null;
    if (!request) {
      if (args.requestId) throw new Error('requestId 不存在，请 client_session 查询');
      const waiting = this.requests.filter(request => request.mode !== 'api' && request.purpose!=='notification' && ['sending', 'waiting', 'replying'].includes(request.status) && (!args.sessionId || request.sessionId === args.sessionId));
      if(waiting.length>1)throw new Error('有多个待回复任务，请指定 requestId/sessionId');request=waiting[0];if(!request){const sessionId=args.sessionId||this.activeSessionId||this.sessions?.state.activeSessionId;if(!sessionId||!await this.sessions?.read(sessionId))throw new Error('请用 client_session 查询并指定有效的 sessionId');request={requestId:randomUUID(),sessionId,mode:'mcp',provider:'MCP',source:'MCP 主动消息',purpose:'notification',createdAt:Date.now(),status:'waiting',text:'',sequence:0,lastOperation:''};this.requests.push(request);}
    }
    if (request.mode === 'api' && metadata.source !== 'api') throw new Error('此请求通过 API 模型回复');
    if (args.sessionId && request.sessionId !== args.sessionId) throw new Error('sessionId 与 requestId 不匹配，回复未发送');
    if (['cancelled', 'failed', 'interrupted'].includes(request.status)) throw new Error('本轮请求已停止或中断，回复未发送');
    const mode = args.mode || 'replace', done = args.done !== false, text = String(args.text || '');
    if (mode === 'append' && args.sequence === undefined) throw new Error('append 分段回复请填写递增 sequence');
    const operation = JSON.stringify({ mode, done, text, sequence: args.sequence });
    if (operation === request.lastOperation || request.status === 'completed' && mode === 'replace' && done && text === request.text) return { received: true, duplicate: true, requestId: request.requestId, sessionId: request.sessionId, done: request.status === 'completed', sequence: request.sequence };
    if (request.status === 'completed') throw new Error('该请求已经完成');
    if (args.sequence !== undefined && args.sequence !== request.sequence + 1) throw new Error(`sequence 必须为 ${request.sequence + 1}`);
    const content = mode === 'append' ? request.text + text : text;
    if (!content.trim()) throw new Error('回复正文不能为空'); if (content.length > 200000) throw new Error('回复累计超过 200000 字符');
    const now = Date.now();
    Object.assign(request, { text: content, status: done ? 'completed' : 'replying', updatedAt: now, firstTokenAt: request.firstTokenAt || now, source: metadata.source || 'MCP', usage: metadata.usage || request.usage, ...(done ? { completedAt: now } : {}), sequence: request.sequence + 1, lastOperation: operation });
    if(done||now-(this.lastStreamSave||0)>1000){await this.save();this.lastStreamSave=now;}const message = this.message(request);
    if(request.purpose!=='diagnostic'){if(done||Date.now()-(request.persistedAt||0)>1500){await this.sessions?.message(message);request.persistedAt=Date.now();}if(done&&request.purpose!=='notification')await this.sessions?.remember(request);this.publish('message.upsert', message);this.publish('client.reply',message);} if(request.purpose!=='notification')this.publish('agent.status', { phase: done ? 'idle' : 'executing', sessionId: request.sessionId }); this.publishActivity(request);this.onReply(message);
    return { received: true, requestId: request.requestId, sessionId: request.sessionId, done, sequence: request.sequence, characters: content.length };
  }
  history(sessionId) { return this.requests.filter(request => request.sessionId === sessionId && request.purpose!=='diagnostic'&&request.purpose!=='notification'&&request.status === 'completed').slice(-20).flatMap(request => [...(request.userText?[{role:'user',content:request.userText}]:[]),{role:'assistant',content:request.text}]); }
  async reasoning(args,metadata={}){const request=this.requests.find(r=>r.requestId===args.requestId&&r.sessionId===args.sessionId);if(!request||['cancelled','failed','interrupted'].includes(request.status))return;if(metadata.source==='browser'&&request.provider!==args.provider)return;const text=String(args.reasoning||'').slice(0,200000);if(text===request.reasoning&&request.reasoningStatus===args.reasoningStatus)return;const now=Date.now();Object.assign(request,{reasoning:text,reasoningStatus:args.reasoningStatus||'streaming',reasoningStartedAt:request.reasoningStartedAt||now,updatedAt:now,...(args.reasoningStatus==='completed'?{reasoningCompletedAt:now}:{})});if(request.purpose!=='diagnostic'){const message=this.message(request);this.publish('message.upsert',message);if(args.reasoningStatus==='completed'){await this.save();await this.sessions?.message(message);}}}
  messages() { return this.requests.filter(request => request.purpose!=='diagnostic'&&(request.text||request.reasoning||request.external||request.replyHeader)).map(request => this.message(request)); }
}
