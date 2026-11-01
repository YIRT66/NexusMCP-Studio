# 已实现的客户端服务接口

最新且完整的接口定义见 [CLIENT-SERVICE-INTEGRATION.md](./CLIENT-SERVICE-INTEGRATION.md)。

服务入口为 `runtime/server.mjs`。本机控制接口默认监听 `127.0.0.1:8765`，支持通过 IPC 报告动态分配的端口。MCP 与 cloudflared 由该运行时管理，工具复用并扩展 `preserved-mcp/`。

当前产品流程由 GPT 网页版通过公网 MCP 调用电脑工具，不要求本地模型 API Key，也没有 `agent.run` 模型聊天接口。Electron 主进程需要启动内置运行时，并在退出时发送 `shutdown` 或断开 IPC。详细 HTTP、WebSocket、数据单位、状态含义、打包布局和关闭清理见上述文档。

注意旧契约中的两处变化：屏幕预览是 PNG data URL；进程列表的 `cpu` 是累计 CPU 秒数，系统负载 `telemetry.cpu` 才是百分比。
