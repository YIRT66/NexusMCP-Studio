import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
async function run(command, args = [], options = {}) {
  try {
    const { stdout } = await execute(command, args, { timeout: 15000, maxBuffer: 24 * 1024 * 1024, ...options });
    return stdout;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Linux 工具未安装：${command}。请参阅 docs/LINUX.md。`);
    throw new Error(`${command} 执行失败：${String(error.stderr || error.message).trim().slice(0, 1000)}`);
  }
}

export function linuxCapabilities() {
  const session = process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'headless');
  return { session, desktop: session === 'x11' && !!process.env.DISPLAY, accessibility: false };
}

function requireX11() {
  const { session, desktop } = linuxCapabilities();
  if (!desktop) throw new Error(session === 'wayland'
    ? '当前为 Wayland 会话，桌面控制需要 X11。请登录 Xorg 会话；终端、文件和浏览器工具仍可使用。'
    : '未检测到 X11 桌面会话（DISPLAY）。无桌面服务器可使用终端、文件和无头浏览器工具。');
}

function page(items, key, options) {
  const query = (options.query || '').toLowerCase();
  const filtered = items.filter(item => (!options.pid || item.pid === options.pid) && (!query || `${item.name || ''} ${item.title || ''} ${item.displayName || ''} ${item.localAddress || ''} ${item.remoteAddress || ''}`.toLowerCase().includes(query)));
  return { [key]: filtered.slice(options.offset || 0, (options.offset || 0) + (options.limit || 80)), total: filtered.length };
}

export async function linuxSystemRequest(action, options = {}) {
  if (action === 'ui_read' || action === 'ui_act') throw new Error('desktop_ui_read/desktop_ui_act 使用 Windows UIA，Linux 暂不支持。浏览器请使用 hancode_page_read/hancode_page_act。');
  if (action === 'processes') {
    const output = await run('ps', ['-eo', 'pid=,comm=,rss=,time=,stat=']);
    const items = output.trim().split('\n').filter(Boolean).map(line => {
      const match = line.trim().match(/^(\d+)\s+(.+?)\s+(\d+)\s+([\d:-]+)\s+(\S+)$/);
      if (!match) return null;
      const [, pid, name, rss, time, state] = match;
      const [days, clock] = time.includes('-') ? time.split('-') : ['0', time];
      const cpuSeconds = clock.split(':').reduce((total, part) => total * 60 + Number(part), 0) + Number(days) * 86400;
      return { pid: Number(pid), name, memoryBytes: Number(rss) * 1024, cpuSeconds, state, responding: !state.startsWith('Z') };
    }).filter(Boolean).sort((a, b) => b.memoryBytes - a.memoryBytes);
    return page(items, 'processes', options);
  }
  if (action === 'services') {
    const output = await run('systemctl', ['list-units', '--type=service', '--all', '--no-pager', '--no-legend', '--plain']);
    return page(output.trim().split('\n').filter(Boolean).map(line => {
      const [name, , active, sub, ...description] = line.trim().split(/\s+/);
      return { name, displayName: description.join(' '), status: active, subState: sub };
    }), 'services', options);
  }
  if (action === 'disks') {
    const output = await run('df', ['-PT', '-B1']);
    return page(output.trim().split('\n').slice(1).map(line => {
      const [name, fileSystem, size, used, free, , ...mount] = line.trim().split(/\s+/);
      return { name, fileSystem, sizeBytes: Number(size), usedBytes: Number(used), freeBytes: Number(free), mount: mount.join(' ') };
    }), 'disks', options);
  }
  if (action === 'network') {
    const output = await run('ss', ['-H', '-t', '-a', '-n', '-p']);
    const address = value => {
      const split = value.lastIndexOf(':');
      return { address: value.slice(0, split).replace(/^\[|\]$/g, ''), port: Number(value.slice(split + 1)) || 0 };
    };
    const connections = output.trim().split('\n').filter(Boolean).map(line => {
      const [state, , , local, remote] = line.trim().split(/\s+/);
      const from = address(local), to = address(remote);
      return { state, localAddress: from.address, localPort: from.port, remoteAddress: to.address, remotePort: to.port, pid: Number(line.match(/pid=(\d+)/)?.[1]) || null };
    });
    return page(connections, 'connections', options);
  }
  requireX11();
  if (action === 'windows') {
    const output = await run('wmctrl', ['-lpG']).catch(async error => {
      // Some EWMH window managers do not create the client list until the first window opens.
      if (!error.message.includes('Cannot get client list properties')) throw error;
      await run('wmctrl', ['-m']);
      return '';
    });
    const active = await run('xdotool', ['getactivewindow']).catch(() => '0');
    const windows = output.trim().split('\n').filter(Boolean).map(line => {
      const [handle, , pid, x, y, width, height, , ...title] = line.trim().split(/\s+/);
      return { handle: String(parseInt(handle, 16)), pid: Number(pid), title: title.join(' '), x: Number(x), y: Number(y), width: Number(width), height: Number(height), foreground: parseInt(handle, 16) === Number(active) };
    });
    return page(windows, 'windows', options);
  }
  if (action === 'screenshot') {
    const png = await run('import', ['-window', 'root', 'png:-'], { encoding: 'buffer' });
    if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('桌面截图未返回 PNG 图像');
    return { image: png.toString('base64'), x: 0, y: 0, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  }
  throw new Error(`Linux 不支持此系统读取操作：${action}`);
}

async function clipboardWrite(text) {
  await new Promise((resolve, reject) => {
    const child = spawn('xclip', ['-selection', 'clipboard', '-in'], { stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('剪贴板写入超时')); }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(new Error(error.code === 'ENOENT' ? '请安装 xclip 后使用剪贴板工具' : error.message)); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`xclip 写入失败 (${code})`)); });
    child.stdin.on('error', () => {});
    child.stdin.end(text || '');
  });
}

export async function linuxDesktop(action, args = {}) {
  if (action === 'window_control' || action === 'focus') {
    if (!/^\d+$/.test(args.handle || '') || BigInt(args.handle) === 0n) throw new Error('窗口句柄无效，请重新读取窗口列表');
  }
  requireX11();
  if (action === 'windows' || action === 'screenshot') return linuxSystemRequest(action, args);
  if (action === 'clipboard_read') return { text: await run('xclip', ['-selection', 'clipboard', '-out']) };
  if (action === 'clipboard_write') { await clipboardWrite(args.text); return { ok: true }; }
  if (['move', 'click', 'double_click', 'right_click', 'scroll'].includes(action)) {
    if (!Number.isInteger(args.x) || !Number.isInteger(args.y)) throw new Error('鼠标操作必须提供 x 和 y');
    await run('xdotool', ['mousemove', '--sync', String(args.x), String(args.y)]);
    if (action === 'scroll' && args.delta) await run('xdotool', ['click', '--repeat', String(Math.max(1, Math.ceil(Math.abs(args.delta) / 120))), '--delay', '20', args.delta > 0 ? '4' : '5']);
    else if (action === 'double_click') await run('xdotool', ['click', '--repeat', '2', '--delay', '100', '1']);
    else if (action === 'click' || action === 'right_click') await run('xdotool', ['click', action === 'click' ? '1' : '3']);
    return { ok: true };
  }
  if (action === 'type') {
    const old = await run('xclip', ['-selection', 'clipboard', '-out']).catch(() => '');
    try {
      await clipboardWrite(args.text);
      await run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
      await new Promise(resolve => setTimeout(resolve, 200));
    } finally { await clipboardWrite(old); }
    return { ok: true };
  }
  if (action === 'keys') {
    if (!args.text?.trim()) throw new Error('keys 需要 xdotool 键名，例如 ctrl+l、Return 或 alt+Tab');
    await run('xdotool', ['key', '--clearmodifiers', ...args.text.trim().split(/\s+/)]);
    return { ok: true };
  }
  if (action === 'window_control' || action === 'focus') {
    const handle = '0x' + BigInt(args.handle).toString(16);
    const known = (await linuxSystemRequest('windows', { limit: 300 })).windows.some(window => window.handle === args.handle);
    if (!known) throw new Error('窗口句柄无效，请重新读取窗口列表');
    const operation = action === 'focus' ? 'focus' : args.operation;
    if (operation === 'focus') await run('wmctrl', ['-ia', handle]);
    else if (operation === 'minimize') await run('xdotool', ['windowminimize', args.handle]);
    else if (operation === 'close') await run('wmctrl', ['-ic', handle]);
    else {
      const states = { maximize: 'add,maximized_vert,maximized_horz', restore: 'remove,maximized_vert,maximized_horz', topmost: 'add,above', unpin: 'remove,above' };
      if (!Object.hasOwn(states, operation)) throw new Error('未知窗口操作');
      await run('wmctrl', ['-ir', handle, '-b', states[operation]]);
      if (operation === 'restore') await run('wmctrl', ['-ia', handle]);
    }
    return { ok: true };
  }
  throw new Error(`Linux 不支持此桌面操作：${action}`);
}
