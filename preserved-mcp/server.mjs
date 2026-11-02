import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerTools, disposeTools, revokeSharedAccess, cancelToolRequest } from './tools.mjs';
import { ensureCloudflared, startTunnel } from './tunnel.mjs';
import { instructions } from './instructions.mjs';
import { z } from 'zod';
import { policy, configure, resolveApproval, cancelApprovals, inContext } from './policy.mjs';
import { authorize } from './policy.mjs';
import { startActivity } from './activity.mjs';
import { configureExtensions, extensionConfiguration, resolveExtension, extensionRequest, cancelExtensions } from './extension-bridge.mjs';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
const clientReplyRule='用户消息带有 NexusMCP requestId/sessionId 时，必须调用 client_reply 把最终回答发送到软件：text=给用户看的 Markdown，requestId/sessionId=消息提供的标识，done=true。长回复可分段 done=false，最后 done=true。不知道标识先 client_session 查询。不能仅在网页里回答或虚构已经回传。';

const directory = path.dirname(fileURLToPath(import.meta.url));
const data = path.resolve(process.env.MCP_DATA_DIR || path.join(directory, 'data'));
const urlFile = process.env.MCP_URL_FILE || path.join(directory, 'PUBLIC-MCP-URL.txt');
const storage = process.env.MCP_STORAGE_DIR || directory;
await fs.mkdir(data, { recursive: true, mode: 0o700 });
// 无登录认证。随机路径就是完整连接地址；不在健康检查、错误和审计日志中输出。
const endpoint = '/mcp/' + randomBytes(24).toString('hex');
const app = express();
app.disable('x-powered-by');
const allowedHosts = new Set();
let publicOrigin;
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!allowedHosts.has(req.headers.host)) return res.status(403).json({ error: '无效主机' });
  if (req.headers.origin && !['https://chatgpt.com', publicOrigin].includes(req.headers.origin)) return res.status(403).json({ error: '无效来源' });
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true, service: 'nexus-computer-mcp', version: '1.4.1' }));
app.use(express.json({ limit: '3mb' }));
let concurrent = 0;
let count = 0, bucket = Date.now();
let auditQueue=Promise.resolve(),auditBuffer=[],auditTimer;
function flushAudit(){clearTimeout(auditTimer);auditTimer=undefined;const batch=auditBuffer.splice(0).join('');if(batch)auditQueue=auditQueue.catch(()=>{}).then(()=>fs.appendFile(path.join(data,'audit.jsonl'),batch,{mode:0o600}));return auditQueue.catch(error=>console.error('审计写入失败：'+error.message));}
const audit=event=>{auditBuffer.push(JSON.stringify({time:new Date().toISOString(),...event})+'\n');if(auditBuffer.length>=32)void flushAudit();else if(!auditTimer)auditTimer=setTimeout(()=>void flushAudit(),40);};

const registry = new Map();
registerTools({ registerTool(name, config, handler) { registry.set(name, { config, handler, schema: z.object(config.inputSchema) }); } }, audit);
const localManifest=[...registry].map(([name,t])=>({name,description:t.config.description,readOnly:!!t.config.annotations.readOnlyHint,inputSchema:zodToJsonSchema(t.schema,{$refStrategy:'none'}),annotations:t.config.annotations}));
function publishManifest(){process.send?.({ type: 'manifest', tools: [...localManifest,...extensionConfiguration().tools.map(t=>({name:t.name,description:t.description,extensionId:t.extensionId,readOnly:false,inputSchema:t.inputSchema}))] });}
publishManifest();
async function invokeTool(name,args){
  const local=registry.get(name);
  if(local)return local.handler(local.schema.parse(args||{}));
  if(!extensionConfiguration().tools.some(t=>t.name===name))return {content:[{type:'text',text:'工具未安装、未启用或已断开'}],isError:true};
  const finish=startActivity(name,args||{});
  try{await authorize(name,args||{},false);const result=await extensionRequest('tool',name,args||{});finish(result);return result}catch(e){finish(undefined,e);return {content:[{type:'text',text:e.message}],isError:true}};
}
app.post(endpoint, async (req, res) => {
  if (Date.now() - bucket > 60000) { bucket = Date.now(); count = 0; }
  if (++count > 600 || concurrent >= 8) return res.status(429).json({ error: '请求过多，请稍后重试' });
  concurrent++;
  if (req.body?.method === 'initialize') process.send?.({ type: 'client', name: String(req.body.params?.clientInfo?.name || 'MCP 客户端').slice(0,100), at: Date.now() });
  const server = new McpServer({ name: 'NexusMCP Studio', version: '1.4.1' }, { capabilities:{tools:{}}, instructions: (policy.prompt || instructions)+'\n\n'+clientReplyRule });
  server.server.setRequestHandler(ListToolsRequestSchema, async()=>({tools:[...localManifest.map(({readOnly,...tool})=>tool),...extensionConfiguration().tools.map(({name,description,inputSchema,annotations})=>({name,description,inputSchema,annotations:{...annotations,readOnlyHint:false,destructiveHint:true}}))]}));
  server.server.setRequestHandler(CallToolRequestSchema, async({params})=>invokeTool(params.name,params.arguments));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  let closed = false;
  const cleanup = () => { if (closed) return; closed = true; concurrent--; void server.close(); };
  res.once('close', cleanup);
  try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
  catch (error) { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32603, message: 'MCP 请求处理失败' } }); audit({ error: 'request_failed' }); }
});
app.all(endpoint, (_req, res) => res.status(405).set('Allow', 'POST').end());
app.use((_req, res) => res.status(404).json({ error: '地址不存在，请使用 PUBLIC-MCP-URL.txt 中的完整地址' }));
app.use((err, _req, res, _next) => res.status(err.status || 400).json({ error: '请求内容无效或过大' }));

const requestedPort = Number(process.env.MCP_PORT || 8790);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('MCP_PORT 无效');
const listener = app.listen(requestedPort, '127.0.0.1');
await new Promise((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
const port = listener.address().port;
allowedHosts.add(`127.0.0.1:${port}`); allowedHosts.add(`localhost:${port}`);
let tunnel;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  tunnel?.child.kill(); cancelApprovals(); cancelExtensions(); await disposeTools(); listener.closeAllConnections(); listener.close();
  await flushAudit();
  await fs.rm(path.join(data, 'connection.json'), { force: true });
  await fs.rm(urlFile, { force: true });
  process.exit(code);
}
process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
process.on('message', async message => {
  if (message?.type === 'stop') void stop();
  else if (message?.type === 'configure') configure(message.settings);
  else if (message?.type === 'extensions.configure') { configureExtensions(message.configuration); publishManifest(); }
  else if (message?.type === 'extension.result') resolveExtension(message);
  else if (message?.type === 'shared.revoke') {cancelApprovals(undefined,message.sharedAccessId);revokeSharedAccess(message.sharedAccessId);}
  else if (message?.type === 'request.cancel') {cancelApprovals(message.requestId);cancelToolRequest(message.requestId);}
  else if (message?.type === 'approval') resolveApproval(message.id, message.allowed);
  else if (message?.type === 'rpc') {
    try { const result = await inContext(message.origin || 'local', () => invokeTool(message.name,message.args),message.context||{}); process.send?.({ type: 'rpc.result', id: message.id, result }); }
    catch (e) { process.send?.({ type: 'rpc.result', id: message.id, error: e.message }); }
  }
});
if (process.send) process.once('disconnect', () => void stop());
try {
  if (process.env.MCP_NO_TUNNEL === '1') publicOrigin = `http://127.0.0.1:${port}`;
  else {
    await fs.mkdir(path.join(storage, 'data', 'tunnel-home'), { recursive: true });
    await fs.writeFile(path.join(storage, 'data', 'quick-tunnel.yml'), '{}\n');
    tunnel = startTunnel(await ensureCloudflared(storage), port, storage);
    publicOrigin = await tunnel.ready;
    allowedHosts.add(new URL(publicOrigin).host);
    tunnel.child.once('exit', () => { if (!stopping) { console.error('[MCP] 隧道已退出，请重新启动以获取新地址。'); void stop(1); } });
  }
  const url = publicOrigin + endpoint;
  await fs.writeFile(path.join(data, 'connection.json'), JSON.stringify({ url, localUrl: `http://127.0.0.1:${port}${endpoint}`, port, pid: process.pid }), { mode: 0o600 });
  await fs.writeFile(urlFile, url + '\n', { mode: 0o600 });
  process.send?.({ type: 'ready', url, localUrl: `http://127.0.0.1:${port}${endpoint}`, port, privilege:process.getuid?.()===0?'root':'user' });
  console.log('\nNexusMCP 电脑控制 MCP 已启动（无身份验证）\n');
  if (process.env.MCP_EMBEDDED !== '1') {
    console.log(`连接地址：${url}\n`);
    console.log('地址已保存：PUBLIC-MCP-URL.txt\n在 ChatGPT 开发者模式中添加此完整 URL，身份验证选择“无”。\n按 Ctrl+C 关闭服务与隧道。');
  }
} catch (e) { console.error('[MCP] 启动失败：' + e.message); await stop(1); }
