# NexusMCP Studio 0.2.0 后端接口索引

完整定义见 [客户端服务接口](CLIENT-SERVICE-INTEGRATION.md)。运行入口为 `runtime/server.mjs`，默认监听 `127.0.0.1:8765`，Electron 通过 IPC 获取实际分配的端口。

当前运行时负责：

- MCP 子进程、工具、审批、持久终端、桌面预览和活动记录。
- 网页聊天桥接、按请求回传的回复，以及 OpenAI 兼容 API 模型。
- 扩展安装、外接 MCP、技能与 DSH 原生插件工作台。
- 带访问凭证的公网远控入口、HTTP / WebSocket 转发及撤销。

前端通过同源 HTTP 和 WebSocket 连接运行时。桌面客户端首次连接后会尝试启动 MCP；只运行服务端命令时，控制接口先处于 MCP 停止状态。退出 Electron 时发送 `shutdown`，清理其管理的子进程与隧道。

屏幕帧为 PNG data URL；进程列表的 `cpu` 是累计 CPU 秒数，`telemetry.cpu` 才是百分比。API 密钥不出现在模型列表或 bootstrap 中。具体扩展格式见 [插件接口](EXTENSIONS-API.md)。
