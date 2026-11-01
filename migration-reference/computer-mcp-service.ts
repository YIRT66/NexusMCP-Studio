import { app, clipboard } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import type { ComputerMcpState } from '../shared/types.js';
import type { AiActivity } from '../shared/ai-activity.js';
import { callMcpTool } from './mcp-service.js';

export class ComputerMcpService {
  private child: ChildProcess | null = null;
  private state: ComputerMcpState = { phase: 'stopped', logs: [] };
  private watchdog: NodeJS.Timeout | null = null;
  private generation = 0;
  private activities: AiActivity[] = [];
  private activityListener: ((activity: AiActivity) => void) | null = null;
  onActivity(listener: (activity: AiActivity) => void) { this.activityListener = listener; }
  activityList() { return this.activities; }
  clearActivities() { this.activities = this.activities.filter(a => a.phase === 'running'); return this.activities; }
  async terminalTool(name: string, args: Record<string, unknown>) {
    if (this.state.phase !== 'running' || !this.state.localUrl) throw new Error('请先启动内置电脑控制 MCP');
    if (!['terminal_create', 'terminal_write', 'terminal_read', 'terminal_close', 'terminal_resize'].includes(name)) throw new Error('未知终端操作');
    return callMcpTool(this.state.localUrl, name, args);
  }
  constructor(private readonly changed: (state: ComputerMcpState) => void, private readonly packageDirectory?: string) {}
  status() { return { ...this.state, logs: [...this.state.logs] }; }
  private update(patch: Partial<ComputerMcpState>) { this.state = { ...this.state, ...patch }; this.changed(this.status()); }
  private log(message: string) { this.update({ logs: [...this.state.logs, message.trim()].filter(Boolean).slice(-60) }); }
  async start() {
    if (this.child || this.state.phase === 'starting') return this.status();
    const generation = ++this.generation;
    this.update({ phase: 'starting', url: undefined, localUrl: undefined, error: undefined, logs: ['正在启动内置电脑控制 MCP，准备临时公网映射…'] });
    try {
      const directory = this.packageDirectory || (app.isPackaged ? path.join(process.resourcesPath, 'computer-mcp') : path.join(app.getAppPath(), 'remote-control'));
      const runtime = path.join(directory, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
      if (!existsSync(runtime)) throw new Error('内置 Node 运行时缺失，请重新安装完整安装包；开发环境请运行 npm run mcp:prepare。');
      const data = path.join(app.getPath('userData'), 'computer-mcp');
      await fs.mkdir(data, { recursive: true });
      if (this.generation !== generation) return this.status();
      const child = spawn(runtime, [path.join(directory, 'server.mjs')], {
        cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, MCP_EMBEDDED: '1', MCP_PORT: '0', MCP_NO_TUNNEL: '0', MCP_DATA_DIR: data, MCP_STORAGE_DIR: data, MCP_URL_FILE: path.join(data, 'PUBLIC-MCP-URL.txt'),
          CLOUDFLARED_PATH: existsSync(path.join(directory, 'bin', 'cloudflared.exe')) ? path.join(directory, 'bin', 'cloudflared.exe') : process.env.CLOUDFLARED_PATH },
      });
      this.child = child;
      child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', message => this.log(String(message)));
      child.stderr?.on('data', message => this.log(String(message)));
      child.on('message', (message: any) => {
        if (message?.type === 'activity' && this.child === child) {
          const event = message.event as AiActivity;
          if (!event?.id || !['running', 'completed', 'error'].includes(event.phase)) return;
          this.activities = [...this.activities.filter(a => a.id !== event.id), event].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-300);
          this.activityListener?.(event);
          return;
        }
        if (message?.type !== 'ready' || this.child !== child || this.state.phase !== 'starting') return;
        if (this.watchdog) clearTimeout(this.watchdog);
        this.watchdog = null;
        this.update({ phase: 'running', url: message.url, localUrl: message.localUrl, startedAt: new Date().toISOString() });
      });
      const exited = (error?: string) => {
        if (this.child !== child) return;
        if (this.watchdog) clearTimeout(this.watchdog);
        this.watchdog = null; this.child = null;
        for (const event of this.activities.filter(a => a.phase === 'running')) {
          Object.assign(event, { phase: 'error', endedAt: new Date().toISOString(), output: '服务已停止，操作被中断。' });
          this.activityListener?.(event);
        }
        const stopped = this.state.phase === 'stopping';
        this.update({ phase: stopped ? 'stopped' : 'error', url: undefined, localUrl: undefined, startedAt: undefined, error: stopped ? undefined : error || '服务意外退出，请查看运行日志后重试。' });
      };
      child.once('error', error => exited(error.message));
      child.once('exit', () => exited());
      this.watchdog = setTimeout(() => { this.log('启动超时，请检查网络连接。'); void this.stop(); }, 240000);
    } catch (error) { this.update({ phase: 'error', error: error instanceof Error ? error.message : String(error) }); }
    return this.status();
  }
  async stop() {
    this.generation++;
    const child = this.child;
    if (!child) { this.update({ phase: 'stopped', url: undefined, localUrl: undefined, error: undefined }); return this.status(); }
    this.update({ phase: 'stopping', url: undefined, localUrl: undefined });
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill(); resolve(); }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      if (child.connected) child.send({ type: 'stop' }, () => {}); else child.kill();
    });
    return this.status();
  }
  async copyUrl() {
    if (this.state.phase !== 'running' || !this.state.url) throw new Error('服务尚未启动，请先启动服务。');
    await clipboard.writeText(this.state.url);
    return true;
  }
}
