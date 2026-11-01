import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs, appendFileSync, statSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {randomBytes} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { instructions } from '../preserved-mcp/instructions.mjs';
import { ExtensionManager } from './extensions.mjs';
import { WebchatRelay } from './webchat-relay.mjs';
import {ClientReplies} from './client-replies.mjs';
const require = createRequire(new URL('../preserved-mcp/package.json', import.meta.url));
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.NEXUS_DATA_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'NexusMCPStudio'));
await fs.mkdir(dataDir, { recursive: true });
const configFile = path.join(dataDir, 'settings.json');
const bridgeKeyFile=path.join(dataDir,'browser-bridge.key');let bridgeKey;try{bridgeKey=(await fs.readFile(bridgeKeyFile,'utf8')).trim()}catch{}if(!/^[a-f0-9]{64}$/.test(bridgeKey||'')){bridgeKey=randomBytes(32).toString('hex');await fs.writeFile(bridgeKeyFile,bridgeKey,{mode:0o600})}
let settings = { theme: 'dark', fontSize: 14, detail: 'standard', autoCollapse: true, frameRate: 1, mode: 'safe', disabled: [], prompt: instructions };
try { settings = { ...settings, ...JSON.parse(await fs.readFile(configFile, 'utf8')) }; } catch {}
let state = { phase: 'stopped', url: '', localUrl: '', error: '', lastClient: '', clientAt: 0, startedAt: 0, localOnly: process.env.MCP_NO_TUNNEL === '1' };
let child, stopPromise, tools = [], calls = [], logs = [], approvals = [], history = [];
let terminal = null, terminalCursor = 0, pollingTerminal = false, pollingScreen = false;
const pending = new Map();
const webRequests=new Map();let webState={provider:'chatgpt',providers:[],status:'等待客户端浏览器',busy:false,transport:'embedded'};
let replies;
function receiveWebEvent(type,data){
 if(type==='webchat.history'||type==='message.upsert')return;
 const waiting=replies?.requests.find(r=>r.sessionId===(data.sessionId||webState.sessionId)&&['sending','waiting','replying'].includes(r.status));
 if(type==='webchat.state'){webState={...data,replyMode:'mcp',busy:!!waiting||data.busy,status:waiting?(waiting.status==='replying'?'MCP 正在回传回复':'等待 GPT 通过 MCP 回复'):data.status};emit(type,webState);}
 else if(type==='agent.status'){emit(type,waiting?{phase:'executing'}:data)}else emit(type,data);
}
let webTransport=settings.webchatTransport==='extension'?'extension':'embedded';const relay=new WebchatRelay((type,data)=>{if(webTransport==='extension')receiveWebEvent(type,data)},bridgeKey);
if(webTransport==='extension')webState=relay.state;
function webCommand(operation,data={}){if(webTransport==='extension')return relay.command(operation,data);if(!process.send||!process.connected)return Promise.reject(new Error('网页聊天需要从桌面客户端启动，请使用 npm start 或客户端 EXE'));const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{webRequests.delete(id);reject(new Error('客户端浏览器响应超时，请打开网页检查状态'))},30000);webRequests.set(id,{resolve,reject,timer});process.send({type:'webchat.command',id,operation,data});});}
function appendActivity(call) {
  const journal = path.join(dataDir, 'activity.jsonl');
  let size = 0; try { size = statSync(journal).size; } catch {}
  if (size > 8 * 1024 * 1024) { rmSync(journal + '.1', {force:true}); renameSync(journal, journal + '.1'); }
  appendFileSync(journal, JSON.stringify(call) + '\n');
}
try { history = JSON.parse(await fs.readFile(path.join(dataDir, 'history.json'), 'utf8')); } catch {}
try {
  const journal = (await fs.readFile(path.join(dataDir, 'activity.jsonl'), 'utf8')).trim().split('\n').slice(-1000);
  const map = new Map();
  for (const line of journal) { try { const call = JSON.parse(line); map.set(call.id, call); } catch {} }
  calls = [...map.values()].slice(-200).map(c => c.status === 'running' ? { ...c, status: 'error', output: '上次服务退出时操作尚未完成', endedAt: Date.now() } : c);
} catch {}
const app = express();
app.disable('x-powered-by');
const listener = app.listen(Number(process.env.NEXUS_PORT || 8765), '127.0.0.1');
await new Promise((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
const port = listener.address().port;
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set([...allowedHosts].map(h => `http://${h}`));
if (process.env.NEXUS_DEV_ORIGIN) allowedOrigins.add(process.env.NEXUS_DEV_ORIGIN);
if (process.env.NEXUS_DESKTOP_ORIGIN) allowedOrigins.add(process.env.NEXUS_DESKTOP_ORIGIN);
const validRequest = req => allowedHosts.has(req.headers.host) && (!req.headers.origin || allowedOrigins.has(req.headers.origin));
function allowDevOrigin(origin){try{const url=new URL(origin);if(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.port)allowedOrigins.add(url.origin)}catch{}}
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); if (!validRequest(req)) return res.status(403).json({ error: '此控制台只接受本机来源' }); next(); });
app.use(express.json({ limit: '3mb' }));
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
listener.on('upgrade', (req, socket, head) => {if(relay.accepts(req)){wss.handleUpgrade(req,socket,head,ws=>relay.connect(ws));return;} if (req.url !== '/ws' || !validRequest(req)) { socket.destroy(); return; } wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
function emit(type, data) { const value = JSON.stringify({ type, data }); for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 8_000_000) ws.send(value); }
replies=new ClientReplies(dataDir,emit,message=>{
 webState={...webState,busy:!message.done,status:message.done?'MCP 回复已接收':'MCP 正在回传回复',replyMode:'mcp'};emit('webchat.state',webState);
 if(message.done)void webCommand('reply.received',{requestId:message.requestId,sessionId:message.sessionId}).catch(()=>{});
});
await replies.init();
async function sendChat(data){
 if(state.phase!=='running')throw new Error('请先启动 MCP 服务，并在 GPT 当前对话中启用该 MCP 应用，回复将通过 client_reply 回传');
 if(typeof data.text!=='string'||!data.text.trim()||data.text.length>100000)throw new Error('消息为空或超过 100000 字符');
 const req=await replies.create({...data,sessionId:data.sessionId||webState.sessionId,provider:webState.provider});
 try{const result=await webCommand('send',{...data,sessionId:req.sessionId,requestId:req.requestId,replyVia:'mcp'});await replies.sent(req);if(req.status!=='completed'){webState={...webState,busy:true,status:'等待 GPT 通过 MCP 回复',replyMode:'mcp'};emit('webchat.state',webState);emit('agent.status',{phase:'executing'})}return {...result,requestId:req.requestId,sessionId:req.sessionId,replyMode:'mcp'};}catch(e){await replies.failed(req,e);throw e}
}
const extensions = new ExtensionManager(dataDir,(type,data)=>{
  if(type==='extensions.config'){if(child?.connected)child.send({type:'extensions.configure',configuration:data});emit('tools.changed',manifest(availableTools()));}
  else if(type==='extension.log')log(`[扩展 ${data.id.slice(0,8)}] ${data.text}`);
  else emit(type,data);
});
await extensions.init();
function availableTools(){return [...tools.filter(t=>!t.extensionId),...extensions.configuration().tools.map(t=>({name:t.name,description:t.description,extensionId:t.extensionId,readOnly:false}))];}
function update(next) { state = { ...state, ...next }; emit('service.state', state); }
function log(text) { for (let line of String(text).split(/\r?\n/)) { line = line.trim(); if (!line) continue; const entry = { id: randomUUID(), at: Date.now(), text: line.slice(0, 2500) }; logs.push(entry); logs = logs.slice(-300); emit('service.log', entry); } }
const decode = result => { const block = result?.content?.find(b => b.type === 'text'); if (result?.isError) throw new Error(block?.text || '工具执行失败'); try { return JSON.parse(block?.text || '{}'); } catch { return block?.text; } };
function manifest(items) { return items.map(t => ({ ...t, group: t.extensionId?'外接 MCP':t.name.startsWith('skill')?'技能':t.name.startsWith('terminal_') ? '终端' : t.name.startsWith('file_') ? '文件' : t.name.startsWith('hancode_') ? '浏览器' : '系统与桌面', enabled: !settings.disabled.includes(t.name), calls: calls.filter(c => c.name === t.name).length, running: calls.some(c => c.name === t.name && c.status === 'running') })); }
function rpc(name, args = {}, origin = 'local') {
  if (!child?.connected || state.phase !== 'running') return Promise.reject(new Error('请先启动 MCP 服务'));
  const id = randomUUID();
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('本机工具调用超时')); }, 120000); pending.set(id, { resolve, reject, timer }); child.send({ type: 'rpc', id, name, args, origin }); });
}
function attachTerminal(id) { if (terminal === id) return; terminal = id; terminalCursor = 0; emit('terminal.created', { id }); }
function handle(message) {
  if (message.type === 'manifest') { tools = message.tools; emit('tools.changed', manifest(availableTools())); }
  if (message.type === 'extension.call') {
    void (async()=>{try{let result;if(message.operation==='client.context')result=replies.context();else if(message.operation==='client.reply')result=await replies.receive(message.args);else if(message.operation==='skill.read')result=await extensions.readSkill(message.name,message.args?.relativePath);else result=await extensions.call(message.name,message.args);if(child?.connected)child.send({type:'extension.result',id:message.id,result});}catch(e){if(child?.connected)child.send({type:'extension.result',id:message.id,error:e.message});}})();
  }
  if (message.type === 'ready') { update({ phase: 'running', url: message.url, localUrl: message.localUrl, startedAt: Date.now(), error: '' }); history = [{ id: randomUUID(), startedAt: state.startedAt, label: 'MCP 远程会话' }, ...history].slice(0, 30); void fs.writeFile(path.join(dataDir, 'history.json'), JSON.stringify(history)).catch(e => log(e.message)); emit('history.changed', history); }
  if (message.type === 'client') update({ lastClient: message.name, clientAt: message.at });
  if (message.type === 'rpc.result') { const p = pending.get(message.id); if (p) { clearTimeout(p.timer); pending.delete(message.id); message.error ? p.reject(new Error(message.error)) : p.resolve(message.result); } }
  if (message.type === 'approval') { approvals.push(message.approval); emit('approval.requested', message.approval); }
  if (message.type === 'approval.resolved') { approvals = approvals.filter(a => a.id !== message.id); emit('approval.resolved', { id: message.id }); }
  if (message.type === 'activity') {
    const e = message.event;
    const parse = value => { try { return JSON.parse(value); } catch { return value; } };
    const call = { id: e.id, source: e.source, name: e.tool, input: parse(e.input), output: e.output === undefined ? undefined : parse(e.output), status: e.phase, startedAt: Date.parse(e.startedAt), endedAt: e.endedAt ? Date.parse(e.endedAt) : undefined };
    const existing = calls.findIndex(c => c.id === call.id);
    if (existing < 0) calls.push(call); else calls[existing] = call;
    calls = calls.slice(-200);
    try { appendActivity(call); } catch (e) { log('记录保存失败：' + e.message); }
    emit(e.phase === 'running' ? 'tool.started' : 'tool.finished', call);
    if (e.phase === 'completed' && e.tool === 'terminal_create') { try { attachTerminal(decode(call.output).id); } catch {} }
    if (e.phase === 'completed' && e.tool === 'desktop_action' && call.input?.x !== undefined) emit('cursor', { x: call.input.x, y: call.input.y, clickId: call.input.action.includes('click') ? randomUUID() : undefined });
  }
}
async function start() {
  if (child || ['starting', 'stopping'].includes(state.phase)) return state;
  extensions.resume();
  logs = []; approvals = [];
  update({ phase: 'starting', url: '', localUrl: '', error: '', lastClient: '', clientAt: 0 });
  const executable = process.platform === 'win32' ? path.join(root, 'preserved-mcp/runtime/node.exe') : process.execPath;
  const current = spawn(executable, [path.join(root, 'preserved-mcp/server.mjs')], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, MCP_EMBEDDED: '1', MCP_PORT: '0', MCP_DATA_DIR: dataDir, MCP_STORAGE_DIR: dataDir, MCP_URL_FILE: path.join(dataDir, 'PUBLIC-MCP-URL.txt'), CLOUDFLARED_PATH: process.env.CLOUDFLARED_PATH || path.join(root, 'preserved-mcp/bin/cloudflared.exe'), NEXUS_STANDALONE: '1' } });
  child = current;
  current.on('message', handle);
  current.stdout.on('data', log); current.stderr.on('data', log);
  current.on('error', e => { log(e.message); update({ phase: 'error', error: e.message }); });
  current.once('spawn', () => {current.send({ type: 'configure', settings: { mode: settings.mode, disabled: settings.disabled, prompt: settings.prompt } });current.send({type:'extensions.configure',configuration:extensions.configuration()});});
  current.once('exit', (code, signal) => {
    if (child !== current) return;
    child = undefined; terminal = null; approvals = [];
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('MCP 服务已停止')); } pending.clear();
    for (const call of calls.filter(c => c.status === 'running')) { call.status = 'error'; call.endedAt = Date.now(); call.output = '服务停止，操作已中断'; emit('tool.finished', call); }
    const expected = state.phase === 'stopping';
    update({ phase: expected || code === 0 ? 'stopped' : 'error', url: '', localUrl: '', error: expected || code === 0 ? '' : `MCP 服务退出（${code ?? signal}），请查看服务日志` });
    emit('approvals.clear', {}); emit('terminal.closed', {}); emit('screen.clear', {});
  });
  return state;
}
async function stop() {
  await replies.cancel();
  if (stopPromise) return stopPromise;
  if (!child) { await extensions.suspend(); update({ phase: 'stopped', url: '', localUrl: '', error: '' }); return; }
  const current = child;
  update({ phase: 'stopping' });
  stopPromise = Promise.all([extensions.suspend(),new Promise(resolve => {
    const timer = setTimeout(() => { if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(current.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else current.kill('SIGKILL'); }, 6000);
    current.once('exit', () => { clearTimeout(timer); resolve(); });
    if (current.connected) current.send({ type: 'stop' }); else current.kill();
  })]).finally(() => { stopPromise = undefined; });
  return stopPromise;
}
async function saveSettings(body) {
  const next = { ...settings };
  if (['dark', 'light', 'system'].includes(body.theme)) next.theme = body.theme;
  if ([12, 13, 14, 15, 16, 18].includes(body.fontSize)) next.fontSize = body.fontSize;
  if (['standard', 'expanded'].includes(body.detail)) next.detail = body.detail;
  if (typeof body.autoCollapse === 'boolean') next.autoCollapse = body.autoCollapse;
  if (typeof body.frameRate === 'number') next.frameRate = Math.max(.2, Math.min(2, body.frameRate));
  if (['safe', 'overdrive'].includes(body.mode)) next.mode = body.mode;
  if (Array.isArray(body.disabled) && body.disabled.every(n => typeof n === 'string')) next.disabled = body.disabled.slice(0, 100);
  if (typeof body.prompt === 'string' && body.prompt.length <= 30000) next.prompt = body.prompt;
  await fs.writeFile(configFile, JSON.stringify(next, null, 2)); settings = next;
  if (child?.connected) child.send({ type: 'configure', settings: { mode: settings.mode, disabled: settings.disabled, prompt: settings.prompt } });
  emit('settings.changed', settings); emit('mode.changed', { mode: settings.mode }); emit('tools.changed', manifest(availableTools()));
  return settings;
}
const route = callback => async (req, res, next) => { try { await callback(req, res); } catch (e) { next(e); } };
app.get('/api/health', (_req,res)=>res.json({ok:true,service:'nexus-local-runtime',version:'1.2.0',mcp:state.phase}));
app.get('/api/webchat',(_req,res)=>res.json(webState));
app.get('/api/client/context',(_req,res)=>res.json(replies.context()));
app.post('/api/client/requests',route(async(req,res)=>{if(state.phase!=='running')throw new Error('请先启动 MCP 服务');if(typeof req.body.text!=='string'||!req.body.text.trim()||req.body.text.length>100000)throw new Error('消息为空或过长');const pending=await replies.create({...req.body,provider:webState.provider});await replies.sent(pending);webState={...webState,busy:true,replyMode:'mcp',status:'等待 GPT 通过 MCP 回复'};emit('webchat.state',webState);emit('agent.status',{phase:'executing'});res.status(201).json({requestId:pending.requestId,sessionId:pending.sessionId,replyMode:'mcp',tool:'client_reply'});}));
app.get('/api/webchat/bridge',(_req,res)=>res.json({url:`ws://127.0.0.1:${port}/webchat/extension/${relay.token}`,connected:!!relay.socket,transport:webTransport}));
app.post('/api/webchat/transport',route(async(req,res)=>{if(webState.busy)throw new Error('请先停止当前回复再切换浏览器');if(!['extension','embedded'].includes(req.body.transport))throw new Error('浏览器类型无效');webTransport=req.body.transport;settings.webchatTransport=webTransport;await fs.writeFile(configFile,JSON.stringify(settings,null,2));webState=webTransport==='extension'?relay.state:{provider:'chatgpt',providers:[],status:'打开内置浏览器并登录',busy:false,transport:'embedded'};emit('webchat.state',webState);res.json(webState);}));
app.post('/api/webchat/activate',route(async(req,res)=>(replies.activeSessionId=req.body.sessionId,res.json(await webCommand('activate',req.body)))));
app.post('/api/webchat/open',route(async(req,res)=>res.json(await webCommand('open',req.body))));
app.post('/api/webchat/send',route(async(req,res)=>res.json(await sendChat(req.body))));
app.post('/api/webchat/stop',route(async(_req,res)=>{await replies.cancel(webState.sessionId);await webCommand('stop');webState={...webState,busy:false,status:'已停止等待 MCP 回复'};emit('webchat.state',webState);res.json({ok:true})}));
app.get('/api/models',(_req,res)=>res.json((webState.providers||[]).map(p=>({id:p.id,name:p.name}))));
app.post('/api/models/select',route(async(req,res)=>{const result=await webCommand('open',{provider:req.body.model});res.json({model:result.provider});}));
app.post('/api/permissions',route(async(req,res)=>{if(!['readonly','workspace','full'].includes(req.body.mode))throw new Error('权限模式无效');await saveSettings({mode:req.body.mode==='full'?'overdrive':'safe'});res.json({mode:req.body.mode,note:'远程读取直接执行，修改操作在安全模式逐次审批；工作区范围不作为操作系统沙盒'});}));
app.get('/api/bootstrap', (_req, res) => res.json({ mode: settings.mode, settings, tools: manifest(availableTools()), servers: extensions.list().filter(e=>e.kind==='mcp').map(e=>({id:e.id,name:e.name,url:e.source,connected:e.connected,tools:e.toolCount})), webchat:webState,clientReplies:replies.messages(),extensions:extensions.list(),phase:webState.busy?'executing':'idle', service: state, calls, logs, approvals, history, terminalId: terminal }));
app.get('/api/extensions',(_req,res)=>res.json({items:extensions.list()}));
app.post('/api/extensions/install',route(async(req,res)=>res.status(202).json(await extensions.install(req.body))));
app.patch('/api/extensions/:id',route(async(req,res)=>res.status(202).json(await extensions.enable(req.params.id,req.body.enabled))));
app.delete('/api/extensions/:id',route(async(req,res)=>{await extensions.remove(req.params.id);res.status(204).end();}));
app.post('/api/mcp/servers',route(async(req,res)=>{const e=await extensions.install({kind:'mcp',name:req.body.name,source:{type:'mcp',value:req.body.url},headers:req.body.headers});res.status(202).json({id:e.id,name:e.name,url:e.source,connected:e.connected,tools:e.toolCount});}));
app.delete('/api/mcp/servers/:id',route(async(req,res)=>{await extensions.remove(req.params.id);res.status(204).end();}));
app.post('/api/service/start', route(async (_req, res) => res.json(await start())));
app.post('/api/service/stop', route(async (_req, res) => { await stop(); res.json(state); }));
app.route('/api/settings').post(route(async (req, res) => res.json(await saveSettings(req.body)))).put(route(async (req, res) => res.json(await saveSettings(req.body))));
app.put('/api/tools/:name', route(async(req,res)=>{if(!availableTools().some(t=>t.name===req.params.name))return res.status(404).json({error:'工具不存在'});const disabled=settings.disabled.filter(n=>n!==req.params.name);if(req.body.enabled!==true)disabled.push(req.params.name);await saveSettings({disabled});res.json({ok:true});}));
app.post('/api/tools/call', route(async(req,res)=>{if(typeof req.body.name!=='string')throw new Error('需要工具名称 name');res.json(await rpc(req.body.name,req.body.args||{}));}));
app.get('/api/prompt/default', (_req, res) => res.json({ prompt: instructions }));
app.post('/api/approvals/:id', (req, res) => { if (!approvals.some(a => a.id === req.params.id && a.expiresAt>Date.now())) return res.status(404).json({ error: '审批已过期或已处理' }); child?.send({ type: 'approval', id: req.params.id, allowed: req.body.allowed === true }); res.json({ ok: true }); });
app.get('/api/fs/list', route(async (req, res) => { const target = path.resolve(String(req.query.path || os.homedir())); const entries = await fs.readdir(target, { withFileTypes: true }); const rows = await Promise.all(entries.slice(0, 2000).map(async e => { let size; try { if (e.isFile()) size = (await fs.stat(path.join(target, e.name))).size; } catch {} return { name: e.name, path: path.join(target, e.name), directory: e.isDirectory(), size }; })); res.json({ path: target, entries: rows.sort((a,b) => Number(b.directory)-Number(a.directory) || a.name.localeCompare(b.name)) }); }));
app.get('/api/system/processes', route(async (_req, res) => { const result = decode(await rpc('system_read', { section: 'processes', limit: 300 }, 'preview')); res.json(result.processes.map(p => ({ pid: p.pid, name: p.name, cpu: p.cpuSeconds || 0, memory: p.memoryBytes }))); }));
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
app.use(express.static(path.join(root, 'frontend/dist')));
app.get('/', (_req, res) => res.status(503).send('前端尚未构建，请执行 npm run build。'));
app.use((e, _req, res, _next) => { if (!res.headersSent) res.status(400).json({ error: e.message || '本机请求失败' }); });
wss.on('connection', ws => {
  ws.screen = false;
  ws.on('message', async raw => {
    try {
      const { type, data = {} } = JSON.parse(raw.toString());
      if (type === 'screen.subscribe') ws.screen = data.enabled === true;
      else if(type==='agent.run'){await sendChat(data);}
      else if(type==='webchat.stop'){await replies.cancel(webState.sessionId);await webCommand('stop');webState={...webState,busy:false,status:'已停止等待 MCP 回复'};emit('webchat.state',webState);}
      else if (type === 'mode.change') await saveSettings({mode:data.mode});
      else if (type === 'terminal.create') { const shells = { pwsh: undefined, cmd: 'cmd.exe', bash: 'bash.exe', wsl: 'wsl.exe' }; if (!(data.shell in shells)) throw new Error('无效终端环境'); const result = decode(await rpc('terminal_create', { shell: shells[data.shell], cols: data.cols, rows: data.rows })); attachTerminal(result.id); }
      else if (type === 'terminal.input') decode(await rpc('terminal_write', { id: data.id, data: data.text }));
      else if (type === 'terminal.resize') decode(await rpc('terminal_resize', data, 'preview'));
      else if (type === 'terminal.close') { decode(await rpc('terminal_close', data)); terminal = null; emit('terminal.closed', {}); }
      else if (type === 'gui.mouse') decode(await rpc('desktop_action', data));
      else if (type === 'agent.stop') {if(webState.busy){await replies.cancel(webState.sessionId);await webCommand('stop');}else await stop();}
    } catch (e) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', data: { message: e.message } })); }
  });
});
const streamTimer = setInterval(async () => {
  if (state.phase !== 'running') return;
  if (terminal && !pollingTerminal && wss.clients.size) {
    pollingTerminal = true; const id = terminal;
    try { const result = decode(await rpc('terminal_read', { id, cursor: terminalCursor, waitMs: 0 }, 'preview')); if (terminal === id) { terminalCursor = result.nextCursor; if (result.output) emit('terminal.output', { id, text: result.output }); if (result.exited) { terminal = null; emit('terminal.closed', {}); } } } catch (e) { log(e.message); terminal = null; emit('terminal.closed', {}); } finally { pollingTerminal = false; }
  }
}, 300);
let lastScreen = 0;
const screenTimer = setInterval(async () => {
  if (state.phase !== 'running' || pollingScreen || Date.now() - lastScreen < 1000/settings.frameRate || ![...wss.clients].some(ws => ws.screen)) return;
  pollingScreen = true; lastScreen = Date.now();
  try { const result = await rpc('desktop_screenshot', {}, 'preview'); const meta = decode(result); const picture = result.content.find(c => c.type === 'image'); if (picture) { const value = JSON.stringify({ type: 'screen.frame', data: { ...meta, data: `data:${picture.mimeType};base64,${picture.data}`, timestamp: Date.now() } }); for (const ws of wss.clients) if (ws.screen && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 4_000_000) ws.send(value); } } catch (e) { log('桌面预览：' + e.message); } finally { pollingScreen = false; }
}, 250);
let previous = os.cpus().map(c => c.times);
const metricsTimer = setInterval(() => { const next = os.cpus().map(c => c.times); let total = 0, idle = 0; next.forEach((t, i) => { idle += t.idle - (previous[i]?.idle || 0); for (const k in t) total += t[k] - (previous[i]?.[k] || 0); }); previous = next; emit('telemetry', { cpu: total ? (1-idle/total)*100 : 0, memory: (1-os.freemem()/os.totalmem())*100 }); }, 2000);
let closing = false;
async function shutdown() { if (closing) return; closing = true; clearInterval(streamTimer); clearInterval(screenTimer); clearInterval(metricsTimer); relay.close(); await stop(); await extensions.dispose(); for (const ws of wss.clients) ws.terminate(); wss.close(); listener.closeAllConnections(); listener.close(() => process.exit()); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
console.log(`NexusMCP Studio 控制台：http://127.0.0.1:${port}`);
console.log('MCP 默认停止。请在控制台点击“启动 MCP”。');
process.send?.({ type: 'runtime.ready', port, url: `http://127.0.0.1:${port}`, dataDir });
process.on('message', message => { if(message?.type==='runtime.allow-origin')allowDevOrigin(message.origin);else if (message?.type === 'shutdown') void shutdown();else if(message?.type==='webchat.result'){const p=webRequests.get(message.id);if(p){clearTimeout(p.timer);webRequests.delete(message.id);message.error?p.reject(new Error(message.error)):p.resolve(message.result)}}else if(message?.type==='webchat.event'&&webTransport==='embedded'){receiveWebEvent(message.event.type,{...message.event.data,...(message.event.type==='webchat.state'?{transport:'embedded'}:{})});} });
if (process.send) process.once('disconnect', () => void shutdown());
if (process.env.NEXUS_OPEN_BROWSER === '1' && process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', `http://127.0.0.1:${port}`], { windowsHide: true, stdio: 'ignore' });
