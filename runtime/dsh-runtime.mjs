import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import platform from '../preserved-mcp/platform.cjs';
export const DSH_VERSION = '0.2.1-rc.5';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'preserved-mcp');
const redact = text => String(text).replace(/([?&](?:token|key|auth)=)[^\s&]+/gi, '$1[已隐藏]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[已隐藏]@');
export class DshRuntime {
  constructor(directory, publish = () => {}) {
    this.directory = path.join(directory, 'dsh'); this.installDir = process.env.NEXUS_DSH_ENGINE_DIR || path.join(this.directory, 'engine'); this.home = path.join(this.directory, 'home'); this.node = process.env.NEXUS_DSH_NODE_PATH || platform.runtimePaths(engine).node; this.publish = publish; this.child = null; this.jobs = new Set(); this.operation = null; this.info = { installed: false, running: false, phase: 'uninstalled', version: DSH_VERSION, error: '', progress: '', url: '' };
  }
  async init() { await fs.mkdir(this.directory, { recursive: true }); try { const pkg = JSON.parse(await fs.readFile(path.join(this.installDir, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')); this.info.installed = pkg.version === DSH_VERSION; this.info.phase = this.info.installed ? 'stopped' : 'uninstalled'; } catch {} }
  snapshot() { return { ...this.info }; }
  update(patch) { Object.assign(this.info, patch); this.publish('dsh.state', this.snapshot()); }
  cli() { return path.join(this.installDir, 'node_modules/@deepseek-ai/dsh/lib/bin.js'); }
  env() { const env = { ...process.env, DSH_HOME: this.home, DSH_TELEMETRY_DISABLED: '1', npm_config_ignore_scripts:'true', PATH: path.join(this.installDir, 'node_modules/.bin') + path.delimiter + process.env.PATH }; delete env.ELECTRON_RUN_AS_NODE; return env; }
  async checkNode() { const version = await this.run(this.node, ['--version'], { timeout: 10000 }); const match = version.match(/v(\d+)\.(\d+)/); if (!match || Number(match[1]) < 24 || Number(match[1]) === 24 && Number(match[2]) < 9) throw new Error('DSH 原生插件需要 Node.js 24.9+。请使用新版桌面安装包，或设置 NEXUS_DSH_NODE_PATH。'); }
  run(command, args, { timeout = 240000, cwd = this.directory } = {}) {
    return new Promise((resolve, reject) => {
      let output = ''; const child = spawn(command, args, { cwd, env: this.env(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); this.jobs.add(child);
      const timer = setTimeout(() => { child.kill(); reject(new Error('DSH 操作超时')); }, timeout);
      const collect = chunk => { output = (output + chunk).slice(-16000); this.update({ progress: redact(chunk.toString()).slice(-700) }); };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      child.once('error', error => { clearTimeout(timer); this.jobs.delete(child); reject(error); });
      child.once('exit', code => { clearTimeout(timer); this.jobs.delete(child); code === 0 ? resolve(output) : reject(new Error(redact(output).slice(-3500) || 'DSH 进程退出：' + code)); });
    });
  }
  async install() {
    if (this.operation) throw new Error('DSH 正在执行其他操作');
    this.operation = (async () => {
      this.update({ phase: 'installing', error: '', progress: '正在安装官方 DSH 兼容引擎' }); await this.checkNode(); await fs.mkdir(this.installDir, { recursive: true });
      await this.run(this.node, [path.join(engine, 'node_modules/npm/bin/npm-cli.js'), 'install', '--prefix', this.installDir, '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '@deepseek-ai/dsh@' + DSH_VERSION, 'pnpm@10.20.0'], { timeout: 600000 });
      await this.init(); if (!this.info.installed) throw new Error('DSH 引擎版本校验失败'); this.update({ phase: 'stopped', installed: true, progress: '' }); return this.snapshot();
    })().catch(error => { this.update({ phase: 'error', error: error.message }); throw error; }).finally(() => { this.operation = null; });
    return this.operation;
  }
  async start() {
    if (this.child || this.info.phase === 'starting') return this.snapshot();
    if (this.operation) throw new Error('请等待 DSH 安装或插件操作完成');
    if (!this.info.installed) throw new Error('请先安装 DSH 兼容引擎');
    await this.checkNode(); await fs.mkdir(this.home, { recursive: true });
    const server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); const port = server.address().port; await new Promise(resolve => server.close(resolve));
    this.update({ phase: 'starting', error: '', progress: '正在启动原生插件工作台', url: '' });
    const child = spawn(this.node, [this.cli(), 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)], { cwd: this.directory, env: this.env(), detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); this.child = child;
    return new Promise((resolve, reject) => {
      let output = '', settled = false; const timer = setTimeout(() => { child.kill(); reject(new Error('DSH 工作台启动超时')); }, 60000);
      const collect = chunk => {
        output = (output + chunk).slice(-18000);this.diagnostics=redact(output).slice(-6000);
        const found = output.replace(/\x1b\[[0-9;]*m/g, '').match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/[^\s]*)/);
        if (found && !settled) { const url = new URL(found[1]); if (Number(url.port) !== port) return; settled = true; clearTimeout(timer); this.update({ phase: 'running', running: true, url: url.href, error: '', progress: '' }); resolve(this.snapshot()); }
      };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      child.once('error', error => { clearTimeout(timer); this.child = null; this.update({ phase: 'error', running: false, error: error.message }); reject(error); });
      child.once('exit', code => { clearTimeout(timer); if (this.child === child) this.child = null; const error = redact(output).slice(-2500); this.update({ running: false, phase: code === 0 || this.info.phase === 'stopping' ? 'stopped' : 'error', url: '', ...(code && this.info.phase !== 'stopping' ? { error } : {}) }); if (!settled) reject(new Error(error || 'DSH 工作台退出：' + code)); });
    });
  }
  async stop() {
    const child = this.child; if (!child) return; this.update({ phase: 'stopping' });
    await new Promise(resolve => {
      const timer = setTimeout(() => { if (process.platform === 'win32') { const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('error', () => child.kill('SIGKILL')); } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } } }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM');
    });
  }
  async plugins() {
    try { const pkg = JSON.parse(await fs.readFile(path.join(this.home, 'profiles/web/package.json'), 'utf8')); const bundles = pkg.dsh?.profile?.bundles || []; return Object.entries(pkg.dependencies || {}).map(([name, version]) => ({ name, version, enabled: bundles.includes(name) })); } catch { return []; }
  }
  validatePlugin({action,spec}) {
    if(!['add','remove'].includes(action)||typeof spec!=='string'||!spec.trim()||spec.length>1500||/^[\s-]/.test(spec)||/[\r\n\0]/.test(spec))throw new Error('请提供有效的插件来源');
    if(!this.info.installed)throw new Error('请先安装官方 DSH 引擎');if(this.operation)throw new Error('DSH 正在执行其他操作');
  }
  async plugin({ action, spec }) {
    this.validatePlugin({action,spec});
    if (!['add', 'remove'].includes(action) || typeof spec !== 'string' || !spec.trim() || spec.length > 1500 || /^[\s-]/.test(spec) || /[\r\n\0]/.test(spec)) throw new Error('请选择安装或移除，并提供有效的包名、Git URL 或本地路径');
    if (!this.info.installed) throw new Error('请先安装官方 DSH 引擎'); if (this.operation) throw new Error('DSH 正在执行其他操作');
    const running = !!this.child; await this.stop();
    this.operation = (async () => {
      this.update({ phase: 'installing', error: '', progress: '正在更新 DSH 原生插件' }); await this.checkNode();
      await this.run(this.node, [this.cli(), 'plugin', '--profile', 'web', action, ...(action==='add'?['--ignore-scripts']:[]), '--', spec.trim()], { timeout: 600000 });
      this.update({ phase: 'stopped', progress: '' }); return this.plugins();
    })().catch(error => { this.update({ phase: 'error', error: error.message }); throw error; }).finally(() => { this.operation = null; });
    const result = await this.operation; if (running) await this.start(); return result;
  }
  async dispose() { for (const child of this.jobs) child.kill(); await this.stop(); }
}
