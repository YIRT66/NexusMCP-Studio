const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function runtimePaths(engine, platform = process.platform) {
  const bundledNode = path.join(engine, 'runtime', platform === 'win32' ? 'node.exe' : 'node');
  const cloudflared = path.join(engine, 'bin', platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  return {
    node: existsSync(bundledNode) ? bundledNode : process.versions.electron ? 'node' : process.execPath,
    cloudflared: existsSync(cloudflared) ? cloudflared : undefined,
  };
}

function terminalShells(platform = process.platform) {
  return platform === 'win32'
    ? { default: undefined, pwsh: undefined, cmd: 'cmd.exe', bash: 'bash.exe', wsl: 'wsl.exe' }
    : { default: undefined, bash: '/bin/bash', sh: '/bin/sh', pwsh: 'pwsh' };
}

function dataDirectory() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'NexusMCPStudio');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'NexusMCPStudio');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'nexusmcp-studio');
}

module.exports = { runtimePaths, terminalShells, dataDirectory };
