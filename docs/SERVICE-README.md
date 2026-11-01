# NexusMCP 独立电脑控制服务（Studio 0.2.0 / 内核包 1.3.0）

此包提供电脑控制 MCP、cloudflared 临时映射与客户端本地控制接口。按构建平台附带 Windows 或 Linux x64 Node 运行时与依赖，基础工具不依赖 Python；安装 PyPI 扩展时需要 Python 3.11+。网页模型不要求模型 API Key，API 模型可在设置中配置。

## 直接给 GPT 使用

双击 `START-MCP.bat`。程序自动启动本机 MCP 与 Cloudflare Quick Tunnel，打印完整 HTTPS MCP 地址，并保存到 `preserved-mcp/PUBLIC-MCP-URL.txt`。

在自己的 ChatGPT 网页设置中添加自定义 MCP 应用，粘贴完整地址，身份验证选择「无」。在对话中使用该应用操作电脑。ChatGPT 账户是否显示自定义应用入口取决于账户权限与当前产品设置；本服务不能代替账户开通功能。

直接启动方式不带本机审批界面，工具以当前用户权限执行。完整随机地址就是访问入口，请保留 `/mcp/` 后面的全部字符并妥善保管。Ctrl+C 停止服务和隧道，临时地址随即失效，重启后得到新地址。

## 内置到客户端

双击 `START-SERVICE.bat` 只启动本地控制接口，默认 `http://127.0.0.1:8765`，服务端初始 MCP 停止；前端连接后会尝试自动启动。客户端通过 `POST /api/service/start` 启动 MCP 和临时隧道，通过 WebSocket 订阅状态与操作记录。

详细协议见同目录的 `客户端接入说明.md`。Electron 打包时把整个服务目录复制到 `resources/service/`，由主进程启动 `preserved-mcp/runtime/node.exe runtime/server.mjs`，不放进 asar。服务退出时清理其管理的浏览器、PTY、系统工作者、DSH 工作台和 cloudflared。

## 控制能力

- 文件列表、文本读取、写入、精准替换、文件名搜索、复制、移动、删除、创建目录。
- 持久 PTY：PowerShell 7 优先，支持 CMD、WSL、自定义 shell；输出增量读取，真实双向输入和终端尺寸调整。
- Windows UIA：直接读取窗口、控件、文本、输入值与操作模式，按快照引用操作控件。
- 独立 Edge / Chrome：读取 DOM、表单、链接、表格、Shadow DOM 和 iframe，按引用批量操作，执行 JavaScript、导航与截图。使用独立浏览器配置目录，原浏览器登录状态不会自动迁入。
- 系统进程、窗口、服务、磁盘、网络信息，终止进程、窗口聚焦/最小化/最大化/关闭/置顶、剪贴板、桌面截图和键鼠。
- 进程内存统计、区域分页、指定地址读取与 DLL / SO 加载；Linux SO 加载需要 gdb。
- 浏览器控制台、异常、JS / CSS 注入和调试控制。
- API 流式聊天、可折叠模型分类、执行时间轴及 DSH 原生插件工作台。
- 设置中建立带访问凭证的 HTTPS 公网远控入口，关闭时撤销链接和远程连接。
- 客户端实时事件：工具参数、结果、异常、审批、终端输出、屏幕预览、鼠标位置和系统负载。
- 扩展安装与管理：本地文件/目录/ZIP、Git、内置 npm、PyPI 独立环境、外接 HTTP/stdio MCP；启停、移除、技能读取与工具实时挂载。详见「插件与技能接口.md」。

## 运行条件与配置

电脑控制权限与启动服务的当前用户相同。Linux 桌面控制支持 X11；其他能力见 Linux 指南。Windows 桌面工具需要已登录的交互式桌面；管理员窗口需要相应权限，程序不会自动绕过 UAC。浏览器需要电脑上安装 Edge 或 Chrome，或通过 `NEXUS_BROWSER_PATH` 指定可执行文件。

| 环境变量 | 说明 |
| --- | --- |
| `NEXUS_PORT` | 客户端控制接口端口，默认 8765；0 自动分配 |
| `NEXUS_DATA_DIR` | 客户端运行时数据目录，默认 Windows 使用本机应用数据目录，Linux 遵循 XDG；Electron 使用自身用户数据目录 |
| `NEXUS_DESKTOP_ORIGIN` | 允许的 Electron 来源，例如 `nexus://studio` |
| `NEXUS_DEV_ORIGIN` | 允许的一个 Vite 开发来源 |
| `NEXUS_BROWSER_PATH` | Edge / Chrome 可执行文件的绝对路径 |
| `CLOUDFLARED_PATH` | 指定 cloudflared，可省略以使用随包文件 |
| `NEXUS_DSH_NODE_PATH` | 可选，指定 Node.js 24.9+ 的 DSH 运行时 |
| `MCP_PORT` | 直接运行 MCP 的本机端口，默认 8790 |
| `MCP_DATA_DIR` | 直接运行 MCP 时的数据目录 |
| `MCP_NO_TUNNEL=1` | 仅用于本地测试，不会生成可供 GPT 网页使用的公网地址 |

临时隧道依赖网络和 Cloudflare 服务，不保证永久在线。服务注册成功后 DNS 可能需要片刻传播；若启动失败，请查看客户端服务日志。协议使用 Streamable HTTP JSON 响应，避免 Quick Tunnel 不支持 SSE 的限制。

本地设置和操作预览日志保留在数据目录；长内容会截断，截图不写入活动日志。日志可能包含文件内容或终端输出，请按自己的隐私需要管理。

## Linux 服务包

Linux 包运行 `./start-mcp.sh` 或 `./start-service.sh`，使用随包的 `preserved-mcp/runtime/node`。Linux 安装、打包和能力限制见同包 `docs/LINUX.md`（源码仓库也提供该文件）。Linux 数据目录遵循 XDG；终端默认 Bash / 当前 Shell。桌面操作仅支持 X11，Windows UIA 暂不支持。

## 公网入口与模型

完整行为见 `docs/WORKSPACE-FEATURES.md`。控制台分享链接和 MCP 连接地址用途不同：前者打开受保护的网页，后者供 AI 客户端连接 MCP。API Key 只保存在运行时数据目录，不随模型列表返回。关闭分享入口不会回滚已执行的文件或系统修改。
