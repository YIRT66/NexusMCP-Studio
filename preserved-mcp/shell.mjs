import { existsSync } from 'node:fs';
import path from 'node:path';
export function defaultShell() {
  if (process.platform !== 'win32') return [process.env.SHELL, '/bin/bash', '/bin/sh'].find(p => p && existsSync(p));
  const candidates = [path.join(process.env.ProgramFiles || 'C:/Program Files', 'PowerShell', '7', 'pwsh.exe'), ...(process.env.PATH || '').split(path.delimiter).map(p => path.join(p, 'pwsh.exe'))];
  return candidates.find(p => existsSync(p)) || 'powershell.exe';
}
