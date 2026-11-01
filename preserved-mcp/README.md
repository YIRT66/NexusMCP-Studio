# NexusMCP 电脑控制内核 1.3.0

本目录提供 NexusMCP Studio 的电脑控制工具、平台适配和 MCP 服务。浏览器使用独立的 Chrome / Chromium / Edge 配置目录，工具以启动服务的当前用户权限运行。

## 启动

Windows 运行 `START-MCP.bat`，Linux 运行 `./start-mcp.sh`。服务启动本机 MCP 与 Cloudflare Quick Tunnel，打印完整连接地址并写入 `PUBLIC-MCP-URL.txt`。在支持自定义 MCP 的 AI 客户端中添加完整地址；ChatGPT 的身份验证选「无」。随机路径本身是访问凭证，Ctrl+C 关闭服务后失效。

桌面或网页版使用上级 `runtime/server.mjs` 管理内核，提供启动、停止、审批、活动记录、API 模型、扩展、技能和浏览器桥接。直接运行本内核没有本机审批界面。

## 控制能力

- 文件读写、搜索、精准替换、目录及文件操作。
- 持久 PTY、系统信息、进程、窗口、剪贴板、截图与键鼠。
- Windows UIA 与 Linux X11 平台工具。
- 浏览器 DOM、表单、iframe、截图、控制台及 JS / CSS 注入。
- 进程内存统计、区域与指定地址读取，以及 Windows DLL / Linux SO 加载。

动态库加载受当前用户与系统调试权限限制；Linux 需要 gdb。外接 MCP 和技能由客户端运行时管理，直接启动本目录仅加载内置工具。共享浏览器模块位于项目根目录 `browser-plugin/`，分发时应使用完整服务包。

## 开发与分发

首次安装依赖：`npm ci --omit=dev --workspaces=false`。源码测试在项目根目录运行 `npm run test:mcp` 或 `npm test`。构建产物已包含平台对应的 Node 和依赖。

使用方式见 [独立服务说明](../docs/SERVICE-README.md)，完整协议见 [客户端接口](../docs/CLIENT-SERVICE-INTEGRATION.md) 和 [插件接口](../docs/EXTENSIONS-API.md)。
