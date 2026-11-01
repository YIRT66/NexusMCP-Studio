import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import platform from '../preserved-mcp/platform.cjs';
import { linuxSystemRequest, linuxDesktop } from '../preserved-mcp/linux-system.mjs';

test('运行时选择当前平台的打包 Node 和 cloudflared，并支持源码运行', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-platform-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'runtime'));
  await fs.mkdir(path.join(directory, 'bin'));
  assert.equal(platform.runtimePaths(directory).node, process.execPath);
  assert.equal(platform.runtimePaths(directory).cloudflared, undefined);
  for (const [os, suffix] of [['linux', ''], ['win32', '.exe']]) {
    await fs.writeFile(path.join(directory, 'runtime', 'node' + suffix), 'fixture');
    await fs.writeFile(path.join(directory, 'bin', 'cloudflared' + suffix), 'fixture');
    assert.equal(platform.runtimePaths(directory, os).node, path.join(directory, 'runtime', 'node' + suffix));
    assert.equal(platform.runtimePaths(directory, os).cloudflared, path.join(directory, 'bin', 'cloudflared' + suffix));
  }
  assert.equal(platform.terminalShells('linux').bash, '/bin/bash');
  assert.equal(Object.hasOwn(platform.terminalShells('linux'), 'cmd'), false);
  assert.equal(platform.terminalShells('win32').cmd, 'cmd.exe');
});

test('Linux 读取真实进程、分页、磁盘与网络', { skip: process.platform !== 'linux' }, async () => {
  const processes = await linuxSystemRequest('processes', { pid: process.pid });
  assert.equal(processes.total, 1);
  assert.equal(processes.processes[0].pid, process.pid);
  assert.ok(processes.processes[0].memoryBytes > 0);
  const paged = await linuxSystemRequest('processes', { limit: 1 });
  assert.equal(paged.processes.length, 1);
  assert.ok(paged.total >= 1);
  assert.equal((await linuxSystemRequest('processes', { query: 'NEXUS_NO_SUCH_PROCESS_4280' })).total, 0);
  const disks = await linuxSystemRequest('disks', { limit: 300 });
  assert.ok(disks.disks.some(disk => disk.sizeBytes > 0 && Number.isFinite(disk.freeBytes)));
  const network = await linuxSystemRequest('network', { limit: 2 });
  assert.ok(Array.isArray(network.connections));
  assert.ok(network.connections.length <= 2);
});

test('Linux 明确返回 Wayland、无桌面和 UIA 的支持限制', { skip: process.platform !== 'linux', concurrency: false }, async () => {
  const saved = Object.fromEntries(['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE'].map(key => [key, process.env[key]]));
  try {
    delete process.env.DISPLAY; delete process.env.WAYLAND_DISPLAY; delete process.env.XDG_SESSION_TYPE;
    await assert.rejects(linuxSystemRequest('screenshot'), /DISPLAY/);
    process.env.XDG_SESSION_TYPE = 'wayland';
    await assert.rejects(linuxDesktop('click', { x: 1, y: 1 }), /Wayland/);
    await assert.rejects(linuxSystemRequest('ui_read'), /Windows UIA/);
    await assert.rejects(linuxDesktop('window_control', { handle: '0', operation: 'focus' }), /窗口句柄无效/);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
