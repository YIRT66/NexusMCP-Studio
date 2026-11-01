import { promises as fs, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

export async function ensureCloudflared(directory) {
  if (process.env.CLOUDFLARED_PATH) return process.env.CLOUDFLARED_PATH;
  const os = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!os || !arch || os === 'darwin') throw new Error('请先安装 cloudflared，并用 CLOUDFLARED_PATH 指定可执行文件');
  const target = path.join(directory, 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  try { await fs.access(target); return target; } catch {}
  await fs.mkdir(path.dirname(target), { recursive: true });
  console.log('[MCP] 正在从 Cloudflare 官方发布下载 cloudflared…');
  const release = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', { headers: { 'user-agent': 'HanCode-MCP' }, signal: AbortSignal.timeout(30000) });
  if (!release.ok) throw new Error(`查询 cloudflared 发布失败：HTTP ${release.status}`);
  const metadata = await release.json();
  const assetName = `cloudflared-${os}-${arch}${process.platform === 'win32' ? '.exe' : ''}`;
  const asset = metadata.assets.find(x => x.name === assetName);
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('官方发布未提供可校验的 SHA-256 摘要，请手动安装 cloudflared');
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`下载 cloudflared 失败：HTTP ${response.status}`);
  const temp = target + '.download';
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
    const hash = createHash('sha256').update(await fs.readFile(temp)).digest('hex');
    if (`sha256:${hash}` !== asset.digest) throw new Error('cloudflared 文件 SHA-256 校验失败');
    await fs.chmod(temp, 0o700);
    await fs.rename(temp, target);
  } catch (e) { await fs.rm(temp, { force: true }); throw e; }
  return target;
}

export function startTunnel(executable, port, directory) {
  const child = spawn(executable, ['tunnel', '--config', path.join(directory, 'data', 'quick-tunnel.yml'), '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${port}`], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  const ready = new Promise((resolve, reject) => {
    let log = '';
    let publicUrl;
    const timer = setTimeout(() => { child.kill(); reject(new Error('获取临时公网地址超时（90 秒），请检查网络后重启')); }, 90000);
    const collect = chunk => {
      process.stderr.write('[cloudflared] ' + chunk.toString());
      log = (log + chunk.toString()).slice(-12000);
      const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) publicUrl = match[0];
      if (publicUrl && log.includes('Registered tunnel connection')) { clearTimeout(timer); resolve(publicUrl); }
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`cloudflared 提前退出 (${code})：${log.slice(-1500)}`)); });
  });
  return { child, ready };
}
