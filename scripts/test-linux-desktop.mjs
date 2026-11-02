import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
import { assertModelMenu } from './verify-model-menu.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-linux-desktop-'));
const executable = process.env.NEXUS_DESKTOP_EXECUTABLE;
const env = { ...process.env, NEXUS_TEST_USER_DATA: directory, MCP_NO_TUNNEL: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const args = executable ? [] : [root];
if (process.env.NEXUS_TEST_NO_SANDBOX === '1') args.push('--no-sandbox');
let app, url, ptyPid, diagnostic = '';
try {
  app = await _electron.launch({ executablePath: executable || require('electron'), args, cwd: os.tmpdir(), env, timeout: 30000 });
  app.process().stdout.on('data', data => { diagnostic = (diagnostic + data).slice(-6000); });
  app.process().stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-6000); });
  const page = await app.firstWindow({timeout:15000});
  page.setDefaultTimeout(15000);
  await page.locator('.desktop-shell').waitFor();
  url = await page.evaluate(() => window.nexusDesktop.getRuntimeURL());
  const api = async (route, body) => {
    const response = await fetch(url + '/api' + route, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if(!response.ok){const diagnostic=await fetch(url+'/api/bootstrap').then(response=>response.json());console.error(JSON.stringify({service:diagnostic.service,logs:diagnostic.logs.slice(-8)}));}
    assert.ok(response.ok, JSON.stringify(result));
    return result;
  };
  const boot = await api('/bootstrap');
  assert.equal(boot.platform, 'linux');
  assert.ok(boot.terminalShells.includes('bash'));
  assert.ok(!boot.terminalShells.includes('cmd'));
  await api('/service/start', {});
  let running;
  for(let attempt=0;attempt<150;attempt++){
    running=await api('/bootstrap');
    if(running.service.phase==='running')break;
    if(running.service.phase==='error')throw new Error(JSON.stringify({service:running.service,logs:running.logs.slice(-8)}));
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(running.service.phase,'running');
  const result = await api('/tools/call', { name: 'terminal_create', args: {} });
  assert.ok(!result.isError, JSON.stringify(result));
  const terminal = JSON.parse(result.content[0].text);
  ptyPid = terminal.pid;
  assert.match(terminal.shell, /bash|zsh|\/sh$/);
  const output = path.join(root, 'output', 'linux-desktop');
  await fs.mkdir(output, { recursive: true });
  await assertModelMenu(page,{screenshot:path.join(output,executable?'packaged-model-menu.png':'source-model-menu.png')});
  await page.screenshot({ path: path.join(output, executable ? 'packaged.png' : 'source.png') });
  await app.close(); app = undefined;
  await assert.rejects(fetch(url + '/api/health'));
  if (ptyPid) assert.throws(() => process.kill(ptyPid, 0), { code: 'ESRCH' });
  console.log(`Linux ${executable ? '打包' : '源码'}桌面：窗口、内置服务、Bash 终端和退出清理均通过。`);
} catch(error) {
  console.error(diagnostic);
  throw error;
} finally {
  if (app) await Promise.race([app.close(), new Promise(resolve => setTimeout(() => { app.process().kill(); resolve(); }, 8000).unref())]);
  await fs.rm(directory, { recursive: true, force: true });
}
