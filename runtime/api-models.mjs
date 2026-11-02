import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { apiInstructions } from '../preserved-mcp/instructions.mjs';

export class ApiModels {
  constructor(directory, { publish, replies, tools, call, cancel, prompt }) { this.file = path.join(directory, 'api-models.json'); Object.assign(this, { publish, replies, tools, call, cancel, prompt }); this.profiles = []; this.jobs = new Map(); this.states = {}; this.persist = Promise.resolve(); }
  async init() { try { const data = JSON.parse(await fs.readFile(this.file, 'utf8')); this.profiles = Array.isArray(data) ? data : []; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  public(profile) { const { apiKey, ...value } = profile; return { ...value, keyConfigured: !!apiKey }; }
  list() { return this.profiles.map(profile => this.public(profile)); }
  async save() { const snapshot = JSON.stringify(this.profiles, null, 2); this.persist = this.persist.catch(() => {}).then(async () => { await fs.writeFile(this.file + '.tmp', snapshot, { mode: 0o600 }); await fs.rename(this.file + '.tmp', this.file); }); await this.persist; this.publish('models.changed', this.list()); }
  async configure(data) {
    const prior = data.id ? this.profiles.find(profile => profile.id === data.id) : null;
    if (data.id && !prior) throw new Error('API 模型不存在');
    const base = new URL(data.baseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('API 地址需为不含账号、参数或片段的 HTTP/HTTPS 地址');
    const name = String(data.name || data.model || '').trim(), model = String(data.model || '').trim();
    if (!name || name.length > 100 || !model || model.length > 200) throw new Error('请填写模型名称和有效的模型 ID');
    if (data.apiKey !== undefined && (typeof data.apiKey !== 'string' || data.apiKey.length > 8000 || /[\r\n]/.test(data.apiKey))) throw new Error('API Key 格式无效');
    const profile = { id: prior?.id || randomUUID(), name, model, provider: String(data.provider || '兼容接口').slice(0, 80), baseUrl: base.href.replace(/\/$/, ''), apiKey: data.clearKey ? '' : data.apiKey?.trim() || prior?.apiKey || '' };
    if(!prior&&this.profiles.length>=30)throw new Error('最多配置 30 个 API 模型');
    this.profiles = prior ? this.profiles.map(value => value.id === prior.id ? profile : value) : [...this.profiles, profile];
    if (this.profiles.length > 30) throw new Error('最多配置 30 个 API 模型');
    await this.save(); return this.public(profile);
  }
  async remove(id) { if ([...this.jobs.values()].some(job => job.profile.id === id)) throw new Error('请先停止使用此模型的任务'); this.profiles = this.profiles.filter(profile => profile.id !== id); await this.save(); }
  update(sessionId, patch) { const next = { ...this.states[sessionId], sessionId, mode: 'api', ...patch }; if(JSON.stringify(next)===JSON.stringify(this.states[sessionId]))return;this.states[sessionId] = next; this.publish('chat.state', next); }
  async start(data) {
    const profile = this.profiles.find(profile => profile.id === data.profileId); if (!profile) throw new Error('请先添加并选择 API 模型');
    if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 100000) throw new Error('消息不能为空或超过 100000 字符');
    if (this.jobs.has(data.sessionId)) throw new Error('当前会话仍在回复');
    if (data.attachments?.some(file => typeof file.name !== 'string' || typeof file.text !== 'string' || file.text.length > 200000)) throw new Error('附件格式不支持，请上传小于 200 KB 的文本文件');
    if ((data.attachments || []).reduce((total, file) => total + file.text.length, 0) > 400000) throw new Error('附件文本合计超过 400 KB');
    const history = this.replies.history(data.sessionId);
    const request = await this.replies.create({ ...data, mode: 'api', provider: profile.provider, model: profile.name });
    const controller = new AbortController(), job = { request, profile: { ...profile }, controller, history };
    this.jobs.set(data.sessionId, job); await this.replies.sent(request);
    this.update(data.sessionId, { busy: true, phase: 'thinking', requestId: request.requestId, profileId: profile.id, status: '正在连接模型', error: '' });
    void this.run(job, data).catch(async error => {
      const clean = new Error(String(error.message || error).split(profile.apiKey || '\0').join('[密钥已隐藏]'));
      if (!controller.signal.aborted) await this.replies.failed(request, clean);
      this.update(request.sessionId, { busy: false, phase: 'idle', status: controller.signal.aborted ? '已停止' : '请求失败', error: controller.signal.aborted ? '' : clean.message });
    }).finally(() => { if (this.jobs.get(data.sessionId) === job) this.jobs.delete(data.sessionId); });
    return { requestId: request.requestId, sessionId: request.sessionId, mode: 'api' };
  }
  async stopShared(accessId){for(const job of this.jobs.values())if(job.request.sharedAccessId===accessId)await this.stop(job.request.sessionId);}
  async stop(sessionId) {
    for (const [id, job] of this.jobs) if (!sessionId || id === sessionId) { job.controller.abort(); this.cancel?.(job.request); await this.replies.cancel(id); this.update(id, { busy: false, phase: 'idle', status: '已停止', error: '' }); }
  }
  async run(job, data) {
    const { request, profile, controller } = job;
    const endpoint = profile.baseUrl.endsWith('/chat/completions') ? profile.baseUrl : profile.baseUrl + '/chat/completions';
    const messages = [{ role: 'system', content: apiInstructions(this.prompt?.()) }, ...job.history];
    let prompt = data.text;
    if (data.goal) prompt = '任务目标：' + String(data.goal).slice(0, 10000) + '\n\n' + prompt;
    if (data.planning) prompt = '先说明计划，等待用户确认后执行修改。\n\n' + prompt;
    for (const file of data.attachments || []) prompt += '\n\n附件 ' + file.name.slice(0, 200) + '：\n' + file.text;
    messages.push({ role: 'user', content: prompt });
    let accumulated = '', lastPublish = 0, usage;
    const publish = async (done = false) => {
      if (!accumulated.trim()) return;
      if (!done && Date.now() - lastPublish < 70) return;
      lastPublish = Date.now(); await this.replies.receive({ requestId: request.requestId, sessionId: request.sessionId, text: accumulated, done }, { source: 'api', usage });
    };
    for (let round = 0; round < 12; round++) {
      controller.signal.throwIfAborted();
      const available = this.tools().filter(tool => tool.enabled !== false && !['client_reply', 'client_session'].includes(tool.name) && (data.permission !== 'readonly' || tool.readOnly));
      const catalog = available.slice(0, 100).map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description.slice(0, 4000), parameters: tool.inputSchema || { type: 'object', properties: {} } } }));
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(profile.apiKey ? { authorization: 'Bearer ' + profile.apiKey } : {}) }, body: JSON.stringify({ model: profile.model, messages, stream: true, ...(catalog.length ? { tools: catalog } : {}) }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]), redirect: 'error' });
      if (!response.ok) { let detail = ''; try { const error = await response.json(); detail = String(error.error?.message || error.message || '').slice(0, 350); } catch {} throw new Error(`API 请求失败（HTTP ${response.status}）${detail ? '：' + detail : ''}`); }
      let content = '', calls = [], finishReason = '', sawData = false;
      const consume = async packet => {
        if (packet.error) throw new Error(String(packet.error.message || 'API 返回错误'));
        if (packet.usage) usage = packet.usage;
        const choice = packet.choices?.[0]; if (!choice) return;
        sawData = true; const delta = choice.delta || choice.message || {};
        if (typeof delta.content === 'string') { content += delta.content; accumulated += delta.content; this.update(request.sessionId, { busy: true, phase: 'thinking', status: '正在回复' }); await publish(); }
        for (const value of delta.tool_calls || []) {
          const index = value.index ?? calls.length; const entry = calls[index] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (value.id) entry.id = value.id;
          if (value.function?.name) entry.function.name += value.function.name;
          if (value.function?.arguments) entry.function.arguments += value.function.arguments;
          if (entry.function.arguments.length > 200000) throw new Error('工具参数超过限制');
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      };
      if (response.headers.get('content-type')?.includes('application/json')) await consume(await response.json());
      else {
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', dataLines = [], done = false;
        const line = async text => {
          if (text.startsWith('data:')) dataLines.push(text.slice(5).trimStart());
          else if (!text.trim() && dataLines.length) { const value = dataLines.join('\n'); dataLines = []; if (value === '[DONE]') { done = true; return; } let packet; try { packet = JSON.parse(value); } catch { throw new Error('API 流式响应格式无效'); } await consume(packet); }
        };
        try {
          while (!done) {
            const chunk = await reader.read(); buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            if (buffer.length > 2 * 1024 * 1024) throw new Error('API 单个事件超过限制');
            let end; while (!done && (end = buffer.indexOf('\n')) >= 0) { const current = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1); await line(current); }
            if (chunk.done) { if (buffer) await line(buffer.replace(/\r$/, '')); await line(''); break; }
          }
        } finally { await reader.cancel().catch(() => {}); }
      }
      controller.signal.throwIfAborted();
      calls = calls.filter(Boolean);
      if (!calls.length) {
        if (!sawData || !content.trim()) throw new Error('API 未返回可显示的回答');
        if (!finishReason) throw new Error('API 连接中断，回复尚未完成');
        if (finishReason === 'length') throw new Error('模型达到输出长度限制，已保留收到的内容');
        await publish(true); this.update(request.sessionId, { busy: false, phase: 'idle', status: '回复完成', error: '' }); return;
      }
      messages.push({ role: 'assistant', content: content || null, tool_calls: calls });
      for (const call of calls) {
        controller.signal.throwIfAborted();
        const known = available.find(tool => tool.name === call.function.name); if (!known || !call.id) throw new Error('模型请求了不可用的工具：' + call.function.name);
        let args; try { args = JSON.parse(call.function.arguments || '{}'); } catch { throw new Error('模型返回的工具参数不是有效 JSON'); }
        this.update(request.sessionId, { busy: true, phase: 'executing', status: '正在调用 ' + call.function.name });
        const result = await this.call(call.function.name, args, request);
        controller.signal.throwIfAborted();
        const text = result.content?.map(block => block.type === 'text' ? block.text : block.type === 'image' ? '[工具返回图像]' : '').join('\n') || JSON.stringify(result);
        messages.push({ role: 'tool', tool_call_id: call.id, content: text.slice(0, 50000) });
      }
      if (content.trim()) accumulated += '\n\n';
      await publish(); this.update(request.sessionId, { busy: true, phase: 'thinking', status: '正在整理工具结果' });
    }
    throw new Error('工具调用已达到 12 轮限制，已保留收到的内容');
  }
}
