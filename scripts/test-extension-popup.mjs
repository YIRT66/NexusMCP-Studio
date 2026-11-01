import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../browser-plugin/', import.meta.url));
const output = fileURLToPath(new URL('../output/extension-ui/', import.meta.url));
await fs.mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const name = request.url === '/' ? 'popup.html' : request.url.slice(1);
  if (!['popup.html', 'popup.js', 'popup.css'].includes(name)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', "script-src 'self'; object-src 'none'");
  response.end(await fs.readFile(path.join(root, name)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const executablePath = [process.env.NEXUS_BROWSER_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', chromium.executablePath()].find(value => value && existsSync(value));
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 392, height: 640 }, colorScheme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixture = { client: { connected: false, endpoint: '', provider: 'chatgpt', url: '' }, page: { ready: true, busy: false, reply: '这是网页的最新回复。' }, messages: [], failSend: false, unsupported: false };
      window.chrome = {
        runtime: { sendMessage: async message => {
          const f = window.fixture;
          if (message.type === 'nexus.status') return f.client;
          if (message.type === 'nexus.connect') { f.client = { ...f.client, connected: true, endpoint: message.url }; return { connecting: true }; }
          if (message.type === 'nexus.disconnect') { f.client.connected = false; f.client.endpoint = ''; return { ok: true }; }
          if (message.type === 'nexus.focus-bound') { f.focused = true; return { ok: true }; }
        } },
        tabs: { query: async () => [{ id: 1 }], sendMessage: async (_id, message) => {
          const f = window.fixture, request = message.data;
          if (f.unsupported) throw new Error('No content script');
          if (request.operation === 'send') {
            if (f.failSend) return { ok: false, error: '模拟发送失败' };
            f.messages.push(request.text); f.page.busy = true;
          }
          if (request.operation === 'stop') f.page.busy = false;
          return { ok: true, value: { ...f.page, stopped: request.operation === 'stop' } };
        } },
      };
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.fixture.copied = text; } } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#connection').filter({ hasText: '未连接' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 392);
    await page.screenshot({ path: path.join(output, `${colorScheme}-disconnected.png`), fullPage: true });
    await page.locator('#endpoint').fill('https://invalid.example');
    await page.locator('#connect').click();
    assert.equal(await page.locator('#endpoint').getAttribute('aria-invalid'), 'true');
    assert.match(await page.getByRole('alert').innerText(), /完整扩展连接地址/);
    await page.getByRole('button', { name: '关闭提示' }).click();
    await page.locator('#endpoint').fill('ws://127.0.0.1:8765/webchat/extension/' + 'a'.repeat(64));
    await page.locator('#connect').click();
    await page.locator('#connection').filter({ hasText: '已连接' }).waitFor();
    await page.evaluate(() => { window.fixture.client.url = 'https://chatgpt.com/c/example'; });
    await page.locator('#open-binding').waitFor();
    await page.locator('#open-binding').click();
    assert.equal(await page.evaluate(() => window.fixture.focused), true);
    await page.locator('#connection-settings > summary').click();
    await page.screenshot({ path: path.join(output, `${colorScheme}-connected.png`), fullPage: true });
    await page.locator('#page-tools > summary').click();
    await page.locator('#text').fill('你好，Linux！');
    await page.locator('#text').press('Control+Enter');
    await page.waitForFunction(() => fixture.messages.length === 1);
    assert.equal(await page.evaluate(() => fixture.messages[0]), '你好，Linux！');
    await page.waitForFunction(() => !document.getElementById('stop').disabled);
    await page.locator('#stop').click();
    await page.waitForFunction(() => document.getElementById('stop').disabled);
    await page.locator('#copy-reply').click();
    assert.equal(await page.evaluate(() => fixture.copied), '这是网页的最新回复。');
    await page.evaluate(() => { fixture.failSend = true; });
    await page.locator('#text').fill('失败后保留草稿');
    await page.locator('#send').click();
    await page.getByRole('alert').filter({ hasText: '模拟发送失败' }).waitFor();
    assert.equal(await page.locator('#text').inputValue(), '失败后保留草稿');
    await page.screenshot({ path: path.join(output, `${colorScheme}-page-tools.png`), fullPage: true });
    await page.evaluate(() => { fixture.unsupported = true; });
    await page.waitForFunction(() => document.getElementById('send').disabled && document.getElementById('reply-section').hidden);
    assert.equal(await page.locator('#reply').textContent(), '');
    await page.locator('#connection-settings > summary').click();
    await page.locator('#disconnect').click();
    await page.locator('#connection').filter({ hasText: '未连接' }).waitFor();
    assert.equal(await page.locator('#endpoint').inputValue(), '');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('扩展 UI：深浅主题、连接校验、会话恢复、快捷发送、停止、复制、失败草稿及断开连接均通过。');
  console.log(`截图：${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
