import { app, BrowserWindow, webContents } from 'electron';
import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pageControl } from './page-control.js';

// 仅本机监听；每次启动轮换凭证，公网入口由独立 MCP 服务负责认证。
export async function startComputerControlBridge(isLocked: () => boolean, controlDirectory?: string) {
  const token = randomBytes(32).toString('hex');
  const directory = controlDirectory || path.join(process.env.LOCALAPPDATA || os.homedir(), 'HanCodeControl');
  const descriptor = path.join(directory, 'bridge.json');
  const server: Server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
    const expected = Buffer.from(token);
    if (req.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: '本机控制认证失败' });
    if (req.method !== 'POST' || req.url !== '/control') return reply(404, { error: '未知接口' });
    if (isLocked()) return reply(423, { error: 'HanCode 已安全锁定' });
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return reply(413, { error: '请求过大' });
        chunks.push(chunk);
      }
      const { action, id, code, url, input, options, frameId } = JSON.parse(Buffer.concat(chunks).toString());
      const windows = BrowserWindow.getAllWindows();
      const main = windows[0];
      if (action === 'status') return reply(200, { version: app.getVersion(), windows: windows.map(w => ({ id: w.id, title: w.getTitle() })), pages: webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), title: w.getTitle(), url: w.getURL() })) });
      if (!main) throw new Error('软件窗口尚未就绪');
      const target = id ? webContents.fromId(Number(id)) : main.webContents;
      if (!target || target.isDestroyed()) throw new Error('页面不存在，请先调用 hancode_status');
      if (action === 'page_read' || action === 'page_act') {
        const frames = target.mainFrame.framesInSubtree;
        const frame = frameId ? frames.find(f => `${f.processId}:${f.routingId}` === frameId) : target.mainFrame;
        if (!frame) throw new Error('页面框架已变化，请重新读取页面获取 frameId');
        const script = `(${pageControl.toString()})(${JSON.stringify({ ...options, operation: action === 'page_act' ? 'act' : 'read' })})`;
        // 主文档放在独立世界中；子框架由 Electron 定位，支持跨源 iframe。
        const result = frame === target.mainFrame
          ? await target.executeJavaScriptInIsolatedWorld(12345, [{ code: script }], true)
          : await frame.executeJavaScript(script, true);
        return reply(200, { ...result, frameId: `${frame.processId}:${frame.routingId}`, frames: action === 'page_read' ? frames.map(f => ({ frameId: `${f.processId}:${f.routingId}`, url: f.url, name: f.name, main: f === target.mainFrame })) : undefined });
      }
      if (action === 'browser_open') {
        const parsed = new URL(url);
        if (!['http:', 'https:', 'about:'].includes(parsed.protocol)) throw new Error('浏览器地址必须为 HTTP/HTTPS/about');
        await main.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('hancode:remote-browser', {detail:${JSON.stringify(parsed.href)}}))`);
        main.show();
        return reply(200, { opened: parsed.href });
      }
      if (action === 'evaluate') {
        if (typeof code !== 'string' || code.length > 200000) throw new Error('无效脚本');
        return reply(200, { value: await target.executeJavaScript(code, true) });
      }
      if (action === 'screenshot') return reply(200, { image: (await target.capturePage()).toPNG().toString('base64') });
      if (action === 'input') { target.focus(); target.sendInputEvent(input); return reply(200, { ok: true }); }
      if (action === 'focus') { main.show(); main.focus(); target.focus(); return reply(200, { ok: true }); }
      if (action === 'navigate') {
        const parsed = new URL(url);
        if (target.getType() !== 'webview' || !['http:', 'https:', 'about:'].includes(parsed.protocol)) throw new Error('仅允许导航浏览器页面');
        await target.loadURL(parsed.href);
        return reply(200, { ok: true });
      }
      throw new Error('未知控制操作');
    } catch (error) { reply(400, { error: error instanceof Error ? error.message : String(error) }); }
  });
  server.requestTimeout = 30000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('控制桥监听失败');
  await fs.writeFile(descriptor, JSON.stringify({ port: address.port, token, pid: process.pid }), { mode: 0o600 });
  app.once('before-quit', () => { server.closeAllConnections(); server.close(); void fs.rm(descriptor, { force: true }); });
  return server;
}
