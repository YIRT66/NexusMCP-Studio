import { createRequire } from 'node:module';
const { parse } = createRequire(import.meta.url)('../browser-plugin/tool-protocol.js');
export class BrowserTools {
  constructor({ replies, tools, call, deliver }) { Object.assign(this,{ replies, tools, call, deliver }); this.rounds = new Map(); }
  async execute(data) {
    const request = this.replies.requests.find(r => r.requestId === data.requestId && r.sessionId === data.sessionId);
    if (!request || request.mode === 'api' || !['sending','waiting','replying'].includes(request.status)) throw new Error('浏览器工具请求已停止或不属于当前任务');
    const parsed = parse(JSON.stringify(data),request.requestId,request.sessionId);
    if (!parsed) throw new Error('工具协议无效');
    let state = this.rounds.get(request.requestId);
    if (!state) { state = { ids:new Map(), rounds:0, busy:false }; this.rounds.set(request.requestId,state); if(this.rounds.size>100)this.rounds.delete(this.rounds.keys().next().value); }
    if (state.busy) throw new Error('上一轮工具仍在执行');
    if (++state.rounds > 24) throw new Error('浏览器工具已达到 24 轮限制');
    state.busy = true;
    const results = [];
    try {
      for (const entry of parsed.calls) {
        if (!['sending','waiting','replying'].includes(request.status)) throw new Error('任务已停止');
        const signature = JSON.stringify([entry.name,entry.args]);
        const prior = state.ids.get(entry.id);
        if (prior && prior.signature !== signature) throw new Error('工具 ID 已用于其他操作');
        if (prior) { results.push(prior.result); continue; }
        const tool = this.tools().find(t => t.name === entry.name && t.enabled !== false && !['client_reply','client_session'].includes(t.name));
        if (!tool || request.permission === 'readonly' && !tool.readOnly) throw new Error('当前权限不允许此工具：'+entry.name);
        const output = await this.call(entry.name,entry.args,request);
        const content = output.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n') || '[工具返回非文本结果]';
        const result = { id:entry.id, name:entry.name, isError:!!output.isError, output:content.slice(0,24000) };
        state.ids.set(entry.id,{signature,result}); results.push(result);
      }
      if (!['sending','waiting','replying'].includes(request.status)) return;
      return await this.deliver({ requestId:request.requestId,sessionId:request.sessionId,results });
    } finally { state.busy = false; }
  }
}
