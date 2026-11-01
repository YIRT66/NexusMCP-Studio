import { chromium } from 'playwright-core';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { pageControl } from './page-control.mjs';

let context;
let opening;
let nextPage = 0, nextFrame = 0;
const pages = new Map();
const frameIds = new WeakMap();
const frameId = frame => { if (!frameIds.has(frame)) frameIds.set(frame, `1:${++nextFrame}`); return frameIds.get(frame); };
function track(page) { if ([...pages.values()].includes(page)) return; const id = ++nextPage; pages.set(id, page); page.once('close', () => pages.delete(id)); }
async function launch() {
  if (context) return context;
  if (opening) return opening;
  opening = (async () => {
    const profile = path.join(process.env.MCP_DATA_DIR || 'data', 'browser-profile');
    await fs.mkdir(profile, { recursive: true });
    const executablePath = process.env.NEXUS_BROWSER_PATH || [
      path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    ].find(p => existsSync(p));
    if (!executablePath && process.platform === 'win32') throw new Error('未找到 Edge 或 Chrome，请安装浏览器或设置 NEXUS_BROWSER_PATH');
    context = await chromium.launchPersistentContext(profile, { executablePath, channel: executablePath ? undefined : 'chrome', headless: process.env.NEXUS_BROWSER_HEADLESS === '1', viewport: null, args: ['--no-first-run', '--no-default-browser-check'] });
    context.pages().forEach(track); context.on('page', track); context.on('close', () => { context = undefined; pages.clear(); });
    return context;
  })().finally(() => { opening = undefined; });
  return opening;
}
export async function closeBrowser() { if (opening) await opening.catch(() => {}); if (context) await context.close().catch(() => {}); context = undefined; pages.clear(); }
export async function browserControl({ action, id, options, frameId: requestedFrame, url, code, input }) {
  if (action === 'status') return { version: '1.2.0', windows: [], browser: 'Nexus 独立浏览器', pages: [...pages].map(([id, p]) => ({ id, type: 'webview', url: p.url(), title: '', standalone: true })) };
  if (action === 'browser_open') {
    const address = new URL(url);
    if (!['http:', 'https:', 'about:'].includes(address.protocol)) throw new Error('仅支持 HTTP/HTTPS/about 页面');
    const browser = await launch(); const page = await browser.newPage(); track(page);
    await page.goto(address.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { opened: page.url(), id: [...pages].find(([, p]) => p === page)[0] };
  }
  const page = id ? pages.get(Number(id)) : [...pages.values()].at(-1);
  if (!page || page.isClosed()) throw new Error('浏览器页面不存在，请先使用 hancode_browser_open 打开网页，再用 hancode_status 获取页面 ID');
  if (action === 'page_read' || action === 'page_act') {
    const frame = requestedFrame ? page.frames().find(f => frameId(f) === requestedFrame) : page.mainFrame();
    if (!frame) throw new Error('iframe 已变化，请重新读取页面');
    const result = await frame.evaluate(pageControl, { ...options, operation: action === 'page_act' ? 'act' : 'read' });
    return { ...result, frameId: frameId(frame), frames: action === 'page_read' ? page.frames().map(f => ({ frameId: frameId(f), url: f.url(), name: f.name(), main: f === page.mainFrame() })) : undefined };
  }
  if (action === 'evaluate') return { value: await page.evaluate(code) };
  if (action === 'screenshot') return { image: (await page.screenshot({ type: 'png' })).toString('base64') };
  if (action === 'navigate') { const address = new URL(url); if (!['http:', 'https:', 'about:'].includes(address.protocol)) throw new Error('无效页面协议'); await page.goto(address.href, { waitUntil: 'domcontentloaded' }); return { ok: true, url: page.url() }; }
  if (action === 'focus') { await page.bringToFront(); return { ok: true }; }
  if (action === 'input') {
    if (input.type === 'mouseMove') await page.mouse.move(input.x, input.y);
    else if (input.type === 'mouseDown' || input.type === 'mouseUp') { await page.mouse.move(input.x, input.y); await page.mouse[input.type === 'mouseDown' ? 'down' : 'up']({ button: input.button || 'left', clickCount: input.clickCount || 1 }); }
    else if (input.type === 'mouseWheel') await page.mouse.wheel(input.deltaX || 0, input.deltaY || 0);
    else if (input.type === 'keyDown') await page.keyboard.down(input.keyCode);
    else if (input.type === 'keyUp') await page.keyboard.up(input.keyCode);
    else if (input.type === 'char') await page.keyboard.insertText(input.keyCode);
    else throw new Error('不支持此输入事件');
    return { ok: true };
  }
  throw new Error('未知浏览器控制操作');
}
