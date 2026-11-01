import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let worker;
let sequence = 0;
let buffer = '';
const pending = new Map();
function shutdown(error) {
  const current = worker; worker = undefined; buffer = '';
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error || new Error('系统信息读取器已停止')); }
  pending.clear(); current?.kill();
}
export function disposeSystemReader() { shutdown(); }

// 长驻 PowerShell 工作者：UIA 程序集只加载一次，保留元素引用，不必每次重新启动进程。
export function systemRequest(action, options = {}) {
  if (process.platform !== 'win32') throw new Error('此工具需要 Windows；其他系统可使用 computer_info、文件及终端工具');
  if (!worker) {
    buffer = '';
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(path.dirname(fileURLToPath(import.meta.url)), 'system-worker.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    worker = child;
    let errors = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => { errors = (errors + data).slice(-4000); });
    child.stdout.on('data', data => {
      if (worker !== child) return;
      buffer += data;
      if (buffer.length > 12 * 1024 * 1024) return shutdown(new Error('系统读取响应过大'));
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          const request = pending.get(message.id);
          if (request) { clearTimeout(request.timer); pending.delete(message.id); message.ok ? request.resolve(message.result) : request.reject(new Error(message.error)); }
        } catch { shutdown(new Error('系统读取响应格式错误')); return; }
      }
    });
    child.once('error', error => { if (worker === child) shutdown(error); });
    child.once('exit', () => { if (worker === child) shutdown(new Error(errors || '系统读取器意外退出')); });
    child.stdin.on('error', error => { if (worker === child) shutdown(error); });
  }
  if (pending.size >= 8) return Promise.reject(new Error('系统读取请求过多，请等待当前请求完成'));
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => shutdown(new Error('系统界面响应超时，已重置读取器；可缩小窗口或控件范围后重试')), 25000);
    pending.set(id, { resolve, reject, timer });
    worker.stdin.write(Buffer.from(JSON.stringify({ id, action, ...options })).toString('base64') + '\n');
  });
}
