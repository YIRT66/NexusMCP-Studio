# NexusMCP 电脑控制内核

保留并扩展自原 HanCode MCP，默认完全独立运行。`hancode_*` 仅保留工具名称兼容，浏览器使用独立的 Edge / Chrome 配置目录，不需要原 HanCode。

Windows 双击 `START-MCP.bat` 即可使用随包 Node 和 cloudflared 启动临时公网 MCP。完整连接地址会打印并写入 `PUBLIC-MCP-URL.txt`。在自己的 GPT 网页账户中添加自定义 MCP 应用，认证选择「无」。Ctrl+C 关闭服务和临时隧道。

客户端内置服务请使用上级 `runtime/server.mjs`，它提供启停、操作轨迹、审批、PTY 输出、屏幕预览、插件与技能安装管理及实时事件。直接启动本内核没有本机审批界面，工具以当前用户权限执行。

支持文件、PTY 终端（PowerShell 7 优先）、Windows UIA、系统读取、进程与窗口控制、剪贴板、键鼠和截图。浏览器优先通过 DOM、引用和 iframe 读取/操作，按需截图。外接 MCP 与技能管理通过客户端运行时挂载，直接启动本文件夹仅加载内置工具。

完整服务协议见源码项目的 `docs/CLIENT-SERVICE-INTEGRATION.md` 和 `docs/EXTENSIONS-API.md`；独立服务包根目录也包含中文使用说明和接口说明。

开发环境首次安装依赖：`npm ci --omit=dev --workspaces=false`。源码测试从项目根目录运行 `node --test runtime/service.test.mjs runtime/extensions.test.mjs`。服务包已包含依赖，无需终端安装。
