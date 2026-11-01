import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('无登录 MCP 协议、PTY 交互、文件、来源限制与桌面截图', { timeout: 60000 }, async t => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hancode-mcp-test-'));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, MCP_NO_TUNNEL: '1', MCP_PORT: '0', MCP_DATA_DIR: temp, MCP_URL_FILE: path.join(temp, 'url.txt') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', x => { errors += x; });
  child.stdout.resume();
  const client = new Client({ name: 'integration-test', version: '1' });
  t.after(async () => { await client.close(); child.kill(); await fs.rm(temp, { recursive: true, force: true, maxRetries: 3 }); });
  let connection;
  for (let i = 0; i < 100; i++) {
    try { connection = JSON.parse(await fs.readFile(path.join(temp, 'connection.json'), 'utf8')); break; } catch {}
    if (child.exitCode !== null) throw new Error(errors);
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(connection, errors);
  const origin = new URL(connection.url).origin;
  assert.equal((await fetch(origin + '/mcp')).status, 404);
  assert.equal((await fetch(connection.url, { method: 'POST', headers: { Origin: 'https://example.org', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(connection.url)).status, 405);
  await client.connect(new StreamableHTTPClientTransport(new URL(connection.url)));
  const { tools } = await client.listTools();
  for (const name of ['terminal_create', 'desktop_screenshot', 'hancode_browser_steps', 'file_write', 'system_read', 'desktop_ui_read', 'desktop_ui_act', 'hancode_page_read', 'hancode_page_act']) assert.ok(tools.some(t => t.name === name), name);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result)); return result;
  };
  const json = r => JSON.parse(r.content[0].text);
  const info = json(await call('computer_info'));
  assert.equal(info.platform, process.platform);
  const target = path.join(temp, '中文路径', '中文.txt');
  await call('file_write', { path: target, content: '你好，MCP！' });
  assert.equal((await call('file_read', { path: target })).content[0].text, '你好，MCP！');
  const term = json(await call('terminal_create', { cwd: temp }));
  try {
    const command = process.platform === 'win32' ? "Write-Output ('PTY_' + '成功'); $x=41\r" : "printf 'PTY_成功\\n'; x=41\r";
    await call('terminal_write', { id: term.id, data: command });
    let output = '', cursor = 0;
    for (let i = 0; i < 20; i++) {
      const r = json(await call('terminal_read', { id: term.id, cursor, waitMs: 200 })); output += r.output; cursor = r.nextCursor;
      if (output.includes('PTY_成功')) break;
    }
    assert.ok(output.includes('PTY_成功'), output);
    await call('terminal_write', { id: term.id, data: process.platform === 'win32' ? 'Write-Output ($x+1)\r' : 'echo $((x+1))\r' });
    let second = '';
    for (let i = 0; i < 10; i++) { const r = json(await call('terminal_read', { id: term.id, cursor, waitMs: 200 })); second += r.output; cursor = r.nextCursor; if (/42/.test(second)) break; }
    assert.match(second, /42/);
    await call('terminal_resize', { id: term.id, cols: 100, rows: 25 });
  } finally { await call('terminal_close', { id: term.id }); }
  const invalid = await client.callTool({ name: 'terminal_write', arguments: { id: 'missing', data: 'x' } });
  assert.equal(invalid.isError, true);
  if (process.platform === 'win32') {
    const cmd = json(await call('terminal_create', { shell: 'cmd.exe', args: ['/d', '/q'], cwd: temp }));
    try {
      await call('terminal_write', { id: cmd.id, data: 'set result=READY\r' });
      await call('terminal_write', { id: cmd.id, data: 'echo CMD_%result%\r' });
      let output = '';
      for (let i = 0; i < 15; i++) { output = json(await call('terminal_read', { id: cmd.id, waitMs: 100 })).output; if (output.includes('CMD_READY')) break; }
      assert.ok(output.includes('CMD_READY'), output);
    } finally { await call('terminal_close', { id: cmd.id }); }
    const overview = json(await call('system_read'));
    assert.ok(overview.memory.totalBytes > 0);
    const processes = json(await call('system_read', { section: 'processes', pid: child.pid }));
    assert.equal(processes.processes[0].pid, child.pid);
    const readyFile = path.join(temp, 'fixture.json');
    const fixture = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'test', 'uia-fixture.ps1'), readyFile], { windowsHide: true, stdio: 'ignore' });
    t.after(() => fixture.kill());
    let ready;
    for (let i = 0; i < 100; i++) { try { ready = JSON.parse(await fs.readFile(readyFile, 'utf8')); break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    assert.ok(ready, 'native UI fixture ready');
    const ui = json(await call('desktop_ui_read', { handle: ready.handle, maxNodes: 30 }));
    assert.ok(ui.nodes.length > 0);
    assert.ok(!JSON.stringify(ui).includes('fixture-secret-do-not-return'), JSON.stringify(ui));
    const edit = ui.nodes.find(n => n.nativeEdit && !n.password);
    const button = ui.nodes.find(n => n.name === 'Apply fixture');
    assert.ok(edit, JSON.stringify(ui)); assert.ok(button);
    await call('desktop_ui_act', { snapshotId: ui.snapshotId, steps: [{ ref: edit.ref, action: 'set_value', value: '直接读取与填写成功' }, { ref: button.ref, action: 'invoke' }] });
    const after = json(await call('desktop_ui_read', { handle: ready.handle, query: '直接读取与填写成功' }));
    assert.ok(after.nodes.some(n => n.name === '直接读取与填写成功'), JSON.stringify(after));
    const invalidUi = await client.callTool({ name: 'desktop_ui_act', arguments: { snapshotId: 'expired', steps: [{ ref: edit.ref, action: 'invoke' }] } });
    assert.equal(invalidUi.isError, true);
    fixture.kill();
    const windows = json(await call('desktop_action', { action: 'windows' }));
    assert.ok(Array.isArray(windows.windows));
    const screenshot = await call('desktop_screenshot');
    assert.equal(screenshot.content[0].type, 'image');
    assert.equal(Buffer.from(screenshot.content[0].data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});
