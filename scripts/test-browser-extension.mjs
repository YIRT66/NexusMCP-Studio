import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startFixture } from '../runtime/webchat-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-extension-live-'));
const fixture = await startFixture();
const child = fork(path.join(root, 'runtime/server.mjs'), [], { env: { ...process.env, NEXUS_DATA_DIR: path.join(directory, 'service'), NEXUS_PORT: '0', MCP_NO_TUNNEL: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
let browser, logs = '';
child.stdout.on('data', data => { logs = (logs + data).slice(-4000); });
child.stderr.on('data', data => { logs = (logs + data).slice(-4000); });
async function until(callback) {
  for (let attempt = 0; attempt < 150; attempt++) { const result = await callback(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('浏览器扩展测试等待超时');
}
try {
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('运行时启动超时：' + logs)), 15000);
    child.on('message', message => { if (message.type === 'runtime.ready') { clearTimeout(timer); resolve(message); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('运行时退出 ' + code + logs)); });
  });
  const api = async (route, body) => {
    const response = await fetch(ready.url + '/api' + route, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
  };
  console.log('扩展测试运行时已启动');
  await api('/service/start', {});
  await until(async () => (await api('/bootstrap')).service.phase === 'running');
  console.log('扩展测试 MCP 已启动');
  await api('/webchat/transport', { transport: 'extension' });
  const { url } = await api('/webchat/bridge');
  const executablePath = [process.env.NEXUS_BROWSER_PATH, chromium.executablePath(), '/usr/bin/chromium', '/usr/bin/google-chrome', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(value => value && existsSync(value));
  const plugin = path.join(root, 'browser-plugin');
  browser = await chromium.launchPersistentContext(path.join(directory, 'browser'), { executablePath, timeout:15000, headless: process.env.NEXUS_BROWSER_HEADLESS === '1', ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + plugin, '--load-extension=' + plugin] });
  browser.setDefaultTimeout(15000);
  console.log('真实扩展浏览器已启动');
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  const html = await fetch(fixture.url + '/chatgpt').then(response => response.text());
  await browser.route('https://chatgpt.com/**', route => route.fulfill({ status: 200, contentType: 'text/html;charset=utf-8', body: route.request().url().endsWith('/framed')?'<iframe src="https://chatgpt.com/inner" style="width:900px;height:700px"></iframe>':html }));
  console.log('Manifest V3 worker 已加载');
  const popup = await browser.newPage();
  await popup.goto(worker.url().replace('background.js', 'popup.html'));
  await popup.locator('#endpoint').fill(url);
  await popup.getByRole('button', { name: '连接', exact: true }).click();
  await popup.locator('#connection').filter({ hasText: '已连接' }).waitFor();
  console.log('真实扩展配对成功');
  await api('/webchat/open', { provider: 'chatgpt', sessionId: 'extension-session-A' });
  const target = await until(() => browser.pages().find(page => page.url().startsWith('https://chatgpt.com/')));
  // Attach routing before navigating an extension-created tab to the local fixture.
  await target.goto('https://chatgpt.com/');
  await target.getByRole('button', { name: '模拟登录', exact: true }).click();
  await until(async () => (await api('/webchat')).status.includes('就绪'));
  const count = browser.pages().length;
  for (const text of ['Linux 扩展第一条', 'Linux 扩展第二条']) {
    const request = await api('/webchat/send', { text, sessionId: 'extension-session-A' });
    await target.waitForFunction(text => window.sentMessages?.at(-1)?.startsWith(text), text);
    assert.ok(await target.evaluate(id => window.sentMessages.at(-1).includes(id), request.requestId));
    const reply = await api('/tools/call', { name: 'client_reply', args: { requestId: request.requestId, sessionId: request.sessionId, text: 'MCP 回复：' + text, done: true } });
    assert.ok(!reply.isError, JSON.stringify(reply));
    await until(async () => !(await api('/webchat')).busy);
    await target.waitForFunction(() => document.getElementById('stop').hidden);
  }
  assert.equal(browser.pages().length, count);
  assert.equal(await target.evaluate(() => sentMessages.length), 2);
  const boot = await api('/bootstrap');
  assert.equal(boot.clientReplies.length, 2);
  assert.ok(boot.clientReplies.every(reply => reply.source === 'MCP' && reply.sessionId === 'extension-session-A'));
  await target.goto('https://chatgpt.com/framed');
  await until(async()=>{const snap=await api('/webchat');return snap.ready&&!snap.busy;});
  const fallback=await api('/webchat/send',{text:'iframe 中的网页回退回复',sessionId:'extension-session-A'});
  await until(async()=>{const boot=await api('/bootstrap');return boot.clientReplies.some(reply=>reply.requestId===fallback.requestId&&reply.source==='browser'&&reply.done);});
  assert.equal((await api('/webchat')).busy,false);
  assert.ok((await api('/bootstrap')).clientReplies.find(reply=>reply.requestId===fallback.requestId).content.includes('iframe 中的网页回退回复'));
  await api('/webchat/open', { provider: 'chatgpt', sessionId: 'extension-session-B' });
  await until(() => browser.pages().length === count + 1);
  assert.equal(browser.pages().length, count + 1);
  await api('/webchat/open', { provider: 'chatgpt', sessionId: 'extension-session-A' });
  assert.equal(browser.pages().length, count + 1);
  await popup.locator('#open-binding').waitFor();
  await popup.locator('#open-binding').click();
  await popup.locator('#connection-settings > summary').evaluate(element => { element.parentElement.open = true; });
  await popup.locator('#disconnect').click();
  await popup.locator('#connection').filter({ hasText: '未连接' }).waitFor();
  await until(async () => !(await api('/webchat/bridge')).connected);
  console.log('真实 Manifest V3 扩展：配对、发送、MCP 回复、iframe 聊天框识别、DOM 完成回退、会话隔离与断开均通过。');
} finally {
  await browser?.close();
  if (child.connected) { child.send({ type: 'shutdown' }); await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill(); resolve(); }, 8000).unref(); }); }
  fixture.server.closeAllConnections(); await new Promise(resolve => fixture.server.close(resolve));
  await fs.rm(directory, { recursive: true, force: true });
}
