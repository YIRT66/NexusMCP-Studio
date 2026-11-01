// 保留原来的命令入口；测试实现支持 Windows / Linux。
import('./test-browser-extension.mjs').catch(error => { console.error(error); process.exitCode = 1; });
