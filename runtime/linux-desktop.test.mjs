import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { linuxCapabilities, linuxDesktop, linuxSystemRequest } from '../preserved-mcp/linux-system.mjs';

test('Linux X11：真实窗口、截图、中文输入、键盘与剪贴板恢复', {
  skip: process.platform !== 'linux' || !linuxCapabilities().desktop,
  timeout: 30000,
}, async t => {
  const executablePath = [process.env.NEXUS_BROWSER_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', chromium.executablePath()].find(value => value && existsSync(value));
  const browser = await chromium.launch({ executablePath, headless: false });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<title>Nexus X11 fixture</title><textarea aria-label="输入"></textarea>');
  await page.bringToFront();
  let window, windows;
  for (let attempt = 0; attempt < 50; attempt++) {
    windows = await linuxSystemRequest('windows');
    window = windows.windows.find(window => window.title.includes('Nexus X11 fixture'));
    if (window) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(window, JSON.stringify(windows));
  await linuxDesktop('window_control', { handle: window.handle, operation: 'focus' });
  await linuxDesktop('window_control', { handle: window.handle, operation: 'maximize' });
  await linuxDesktop('window_control', { handle: window.handle, operation: 'restore' });
  await page.getByRole('textbox').click();
  await linuxDesktop('clipboard_write', { text: '原来的剪贴板' });
  await linuxDesktop('type', { text: 'Linux 中文输入成功' });
  await page.waitForFunction(() => document.querySelector('textarea').value === 'Linux 中文输入成功');
  assert.equal((await linuxDesktop('clipboard_read')).text, '原来的剪贴板');
  await linuxDesktop('keys', { text: 'ctrl+a' });
  await linuxDesktop('type', { text: '键盘操作成功' });
  await page.waitForFunction(() => document.querySelector('textarea').value === '键盘操作成功');
  await linuxDesktop('move', { x: 50, y: 60 });
  const screenshot = await linuxSystemRequest('screenshot');
  assert.ok(screenshot.width > 0 && screenshot.height > 0);
  assert.equal(Buffer.from(screenshot.image, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
