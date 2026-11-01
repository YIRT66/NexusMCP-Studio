import { useEffect, useRef, useState } from 'react';
import { Bot, TerminalSquare, Trash2, X, Square, Play, Search } from 'lucide-react';
import type { AiActivity, ComputerMcpState } from '../../shared/types';
import { useWorkbench } from '../store/workbench';
import { AiTerminalOutput } from './AiTerminalOutput';

function readable(value = '') {
  try {
    const data = JSON.parse(value);
    if (data.content) return data.content.map((c: any) => c.type === 'text' ? c.text : '[截图]').join('\n');
    return JSON.stringify(data, null, 2);
  } catch { return value; }
}
const names: Record<string, string> = { terminal_create: '创建终端', terminal_write: '输入终端命令', terminal_read: '读取终端输出', terminal_close: '关闭终端', file_read: '读取文件', file_write: '写入文件', file_list: '查看目录', hancode_page_read: '读取页面', hancode_page_act: '操作页面', hancode_browser_open: '打开网页', system_read: '读取系统信息', desktop_ui_read: '读取窗口控件', desktop_ui_act: '操作窗口控件', hancode_evaluate: '执行页面脚本' };
function targetLabel(event: AiActivity) {
  try { const a = JSON.parse(event.input); return String(a.path || a.url || a.data?.trim() || a.section || a.steps?.map((s: any) => s.action).join(' → ') || '').slice(0, 180); } catch { return ''; }
}

export function AiActivityPage({ hidden }: { hidden: boolean }) {
  const [events, setEvents] = useState<AiActivity[]>([]);
  const [service, setService] = useState<ComputerMcpState>({ phase: 'stopped', logs: [] });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showPolling, setShowPolling] = useState(false);
  const [shell, setShell] = useState('default');
  const [command, setCommand] = useState('');
  const [terminal, setTerminal] = useState<string>();
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cursor = useRef(0);
  const close = useWorkbench(s => s.setAiPageOpen);
  const root = useWorkbench(s => s.root);
  useEffect(() => {
    let active = true;
    const merge = (event: AiActivity) => setEvents(current => [...current.filter(e => e.id !== event.id), event].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-300));
    const off = window.hancode.computerMcp.onActivity(merge);
    const offState = window.hancode.computerMcp.onChanged(setService);
    void window.hancode.computerMcp.activities().then(list => { if (active) setEvents(current => [...new Map([...list, ...current].map(e => [e.id, e])).values()].slice(-300)); }).catch(e => setError(String(e)));
    void window.hancode.computerMcp.status().then(state => { if (active) setService(state); }).catch(e => setError(String(e)));
    return () => { active = false; off(); offState(); };
  }, []);
  async function call(name: string, args: Record<string, unknown>) {
    const result = await window.hancode.computerMcp.terminalTool(name, args);
    if (!result.ok || result.isError) throw new Error(result.error || result.content.map(c => c.text || '').join('\n'));
    return JSON.parse(result.content.find(c => c.type === 'text')?.text || '{}');
  }
  useEffect(() => {
    if (hidden || !terminal || service.phase !== 'running') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const result = await call('terminal_read', { id: terminal, cursor: cursor.current, waitMs: 0 });
        if (cancelled) return;
        cursor.current = result.nextCursor;
        if (result.output) setOutput(current => (current + result.output).slice(-80000));
        if (result.exited) { setTerminal(undefined); return; }
      } catch (e) { if (!cancelled) { setError(String(e)); setTerminal(undefined); } }
      if (!cancelled) timer = setTimeout(() => void read(), 1000);
    };
    void read(); return () => { cancelled = true; clearTimeout(timer); };
  }, [hidden, terminal, service.phase]);
  useEffect(() => { if (service.phase !== 'running') setTerminal(undefined); }, [service.phase]);
  async function send() {
    if (!command.trim() || busy) return;
    setBusy(true); setError('');
    try {
      let id = terminal;
      if (!id) {
        const session = await call('terminal_create', { shell: shell === 'default' ? undefined : shell, cwd: root || undefined });
        id = session.id; cursor.current = 0; setTerminal(id); setOutput(`终端：${session.shell}\n`);
      }
      await call('terminal_write', { id, data: command + '\r' }); setCommand('');
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function action(kind: 'start' | 'stop' | 'clear') {
    setError('');
    try {
      if (kind === 'clear') setEvents(await window.hancode.computerMcp.clearActivities());
      else setService(await window.hancode.computerMcp[kind]());
    } catch (e) { setError(String(e)); }
  }
  const running = events.filter(e => e.phase === 'running').length;
  const serviceLabel = { starting: '正在建立公网连接…', running: '已连接，等待 AI 操作', stopped: 'MCP 未运行', stopping: '正在停止 MCP…', error: 'MCP 启动失败' }[service.phase];
  const list = events.filter(e => (showPolling || e.tool !== 'terminal_read') && (filter === 'all' || e.phase === filter) && (e.tool + e.input + e.output).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className={'ai-activity-page' + (hidden ? ' ai-hidden' : '')} aria-label="AI 操作页面">
    <header><div><Bot size={20} /><h2>AI 操作</h2><span role="status">{running ? `${running} 个工具调用正在运行` : serviceLabel}</span></div><div><button disabled={['starting', 'stopping'].includes(service.phase)} onClick={() => void action(service.phase === 'running' ? 'stop' : 'start')}>{service.phase === 'running' ? <Square size={14} /> : <Play size={14} />}{service.phase === 'running' ? '停止 MCP' : '启动 MCP'}</button><button title="关闭 AI 页面" aria-label="关闭 AI 页面" onClick={() => close(false)}><X size={17} /></button></div></header>
    <p className="ai-caption">查看本软件 MCP 的真实工具调用、文件读写、终端和页面操作。完成表示工具调用已返回；后台命令可能仍在运行。记录保留在本次软件运行中，最多 300 条。</p>
    {(error || service.error) && <p role="alert" className="ai-error">{error || service.error}</p>}
    <div className="ai-layout"><div className="ai-history">
      <div className="ai-filters"><label><Search size={14} /><input aria-label="搜索 AI 操作" placeholder="搜索命令、文件或工具" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="筛选操作状态" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部状态</option><option value="running">运行中</option><option value="error">失败</option><option value="completed">已完成</option></select><button title="清除已结束的记录" onClick={() => void action('clear')}><Trash2 size={14} /></button></div>
      <label className="ai-polling"><input type="checkbox" checked={showPolling} onChange={e => setShowPolling(e.target.checked)} />显示终端输出轮询</label>
      <div className="ai-event-list">{list.length ? [...list].reverse().map(event => <details key={event.id} className={'ai-event ' + event.phase}><summary><span className="ai-event-dot" /><strong>{names[event.tool] || event.tool}{targetLabel(event) && <small className="ai-event-target">{targetLabel(event)}</small>}</strong><span>{event.phase === 'running' ? '运行中' : event.phase === 'error' ? '失败' : '已完成'}</span><time>{new Date(event.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}</time></summary><small>{event.tool} · {event.source}{event.durationMs !== undefined ? ` · ${event.durationMs} ms` : ''}</small><h4>操作参数</h4><pre>{readable(event.input)}</pre>{event.output && <><h4>输出结果</h4><pre>{readable(event.output)}</pre></>}</details>) : <div className="ai-empty"><Bot size={28} /><h3>等待 AI 操作</h3><p>连接 GPT 网页版并使用此 MCP 后，操作会实时显示在这里。</p></div>}</div>
    </div><div className="ai-terminal"><h3><TerminalSquare size={16} />持久终端</h3><select aria-label="终端环境" value={shell} disabled={!!terminal} onChange={e => setShell(e.target.value)}><option value="default">PowerShell 7（优先）</option><option value="cmd.exe">CMD</option><option value="powershell.exe">Windows PowerShell</option><option value="wsl.exe">WSL</option></select><p>同一个终端保留变量和目录。未安装 PowerShell 7 时回退到 Windows PowerShell。</p><AiTerminalOutput output={output} visible={!hidden} onResize={(cols, rows) => { if (terminal) void call('terminal_resize', { id: terminal, cols, rows }).catch(() => {}); }} /><form onSubmit={e => { e.preventDefault(); void send(); }}><input aria-label="终端命令" placeholder="输入命令，如 Get-Location" value={command} onChange={e => setCommand(e.target.value)} disabled={service.phase !== 'running'} /><button disabled={busy || !command.trim() || service.phase !== 'running'}>{busy ? '发送中…' : '运行'}</button></form>{terminal && <div className="ai-terminal-actions"><button onClick={() => void call('terminal_write', { id: terminal, data: '\u0003' }).catch(e => setError(String(e)))}>中断命令 Ctrl+C</button><button onClick={() => void call('terminal_close', { id: terminal }).then(() => setTerminal(undefined)).catch(e => setError(String(e)))}>关闭终端</button></div>}</div></div>
  </section>;
}
