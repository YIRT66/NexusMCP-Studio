import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
// 从 Node 环境启动真正的 Electron，避免继承宿主的 Node 运行模式。
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [root, ...process.argv.slice(2)], {
  // 这是用户要看的桌面窗口。隐藏进程会让普通 BAT 启动的 Electron 无法正常显示。
  cwd: root, env, stdio: 'inherit', windowsHide: false,
});
child.on('error', error => { console.error('桌面软件启动失败：', error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
