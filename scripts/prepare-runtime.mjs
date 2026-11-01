import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCloudflared } from '../preserved-mcp/tunnel.mjs';

// Run on the target OS/architecture so native PTY dependencies and Node match.
const engine = fileURLToPath(new URL('../preserved-mcp/', import.meta.url));
const executable = path.join(engine, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
await fs.mkdir(path.dirname(executable), { recursive: true });
await fs.copyFile(process.execPath, executable);
if (process.platform !== 'win32') await fs.chmod(executable, 0o755);
const tunnel = await ensureCloudflared(engine);
const bundledTunnel = path.join(engine, 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
await fs.mkdir(path.dirname(bundledTunnel), { recursive: true });
if (path.resolve(tunnel) !== bundledTunnel) await fs.copyFile(tunnel, bundledTunnel);
if (process.platform !== 'win32') await fs.chmod(bundledTunnel, 0o755);
console.log(`运行时已准备：${process.platform}/${process.arch}`);
