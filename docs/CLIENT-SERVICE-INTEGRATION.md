# NexusMCP Studio 0.2.0 客户端服务接口

`runtime/server.mjs` 为桌面和网页版提供同源 HTTP / WebSocket 接口，管理电脑控制内核、模型请求、扩展、浏览器桥接及公网入口。

## 启动与打包

源码运行 `npm run service:start`，默认监听 `http://127.0.0.1:8765`；`NEXUS_PORT=0` 自动分配端口。仅启动运行时不会立即启动 MCP，前端首次连接后调用 `ensureMcpStarted()`，也可调用 `POST /api/service/start`。

Electron 以独立 Node 子进程启动运行时，并通过 IPC 接收 `{type:'runtime.ready',url,port}`。该消息只说明控制接口就绪，MCP 状态仍以 `service.phase` 为准。退出时发送 `{type:'shutdown'}`；IPC 断开也会触发清理。

打包目录为 `resources/service/`，包含 `runtime/`、`preserved-mcp/`、`browser-plugin/`、`frontend/dist/` 和依赖。主进程使用平台对应的 `preserved-mcp/runtime/node.exe` 或 `node`，不在 asar 内启动服务。构建入口为 `scripts/package-service.mjs`。

主进程设置 `NEXUS_DATA_DIR` 保存数据，使用 `NEXUS_DESKTOP_ORIGIN` 声明桌面来源。开发代理可通过 `NEXUS_DEV_ORIGIN` 声明 Vite 来源。运行时校验 Host / Origin，不使用通配 CORS。

## HTTP 接口

除文件上传外，请求使用 JSON。错误返回非 2xx 和 `{error:string}`。工具调用返回 MCP `CallToolResult`，还需检查其 `isError`。

| 方法 / 路径 | 用途 |
| --- | --- |
| GET `/api/health` | 运行时健康状态 |
| GET `/api/bootstrap` | 平台、设置、MCP、工具、活动、审批、模型、聊天、扩展、DSH 与公网状态 |
| POST `/api/service/start` | 启动 MCP，返回当前状态；通过事件等待 `running` 或 `error` |
| POST `/api/service/stop` | 停止 MCP、API 请求及其管理的终端和浏览器 |
| POST / PUT `/api/settings` | 更新主题、字号、工具禁用列表、审批方式及默认提示词等设置 |
| PUT `/api/tools/:name` | `{enabled:boolean}`，启停指定工具 |
| POST `/api/tools/call` | `{name,args}`，执行工具并返回 MCP 结果 |
| POST `/api/approvals/:id` | `{allowed:boolean}`，处理待审批操作 |
| GET `/api/fs/list?path=...` | 文件列表；空路径使用当前用户主目录 |
| GET `/api/system/processes` | 进程列表；CPU 为累计秒数，内存为字节 |
| POST `/api/permissions` | `{mode:'readonly'\|'workspace'\|'full',workspace?,sessionId?}`；返回确认的模式 |
| GET `/api/model-profiles` | API 模型列表，只返回密钥是否配置 |
| POST `/api/model-profiles` | 新建或更新 `{id?,name,provider?,baseUrl,model,apiKey?}` |
| DELETE `/api/model-profiles/:id` | 删除模型配置，使用中需先停止任务 |
| POST `/api/chat/send` | `{sessionId,profileId,text,permission?,planning?,goal?,attachments?}`，启动 API 请求并返回 202 |
| POST `/api/chat/stop` | `{sessionId}`，停止指定 API 请求及其待审批操作 |
| GET / POST `/api/webchat/...` | 网页聊天，见 [网页聊天接口](WEBCHAT.md) |
| GET / POST `/api/extensions/...` | 扩展与文件上传，见 [插件接口](EXTENSIONS-API.md) |
| GET `/api/public-access` | 本机公网入口状态 |
| POST `/api/public-access/start` | 开始建立 HTTPS 隧道，返回 202；状态通过事件更新 |
| POST `/api/public-access/stop` | 撤销链接、断开远程连接，停止该入口的 API 请求和终端 |
| GET `/api/dsh` | 官方 DSH 兼容引擎状态 |
| POST `/api/dsh/install` | 按需安装固定版本引擎，返回 202 |
| POST `/api/dsh/start` / `/stop` | 启停本机 DSH 原生工作台 |
| GET / POST `/api/dsh/plugins` | 查询原生插件，或提交 `{action:'add'\|'remove',spec}` |
| POST `/api/feedback` | `{sessionId,text}`，保存会话反馈 |

`bootstrap.remote` 表示连接是否来自公网门户；远程连接不返回分享链接或 DSH 工作台凭证，也不能管理这两项设置。

## 模型与回复

网页模型通过 `/api/webchat/send` 发送带 `requestId/sessionId` 的任务。优先使用 `client_reply` 回传；网页回复结束且稳定后可自动同步最终正文。API 模型通过 `/api/chat/send` 使用 OpenAI 兼容接口，支持流式文本和最多 12 轮工具调用。

两种方式都使用 `message.upsert` 更新同一条助手消息。消息记录来源、会话、请求、开始时间、首段时间、完成时间和状态；未知时间不补造。API 密钥只保存在运行时数据目录，模型列表与实时事件不返回密钥。

## 状态与权限

`service.phase` 为 `stopped / starting / running / stopping / error`。`service.url` 为完整 MCP 连接地址，包含随机路径；停止后清空。`localOnly` 表示测试用本机模式，不能当作公网连接地址。`lastClient/clientAt` 仅代表最近一次客户端初始化。

`safe` 模式下，模型发起的修改操作需要审批；`overdrive` 允许启用的工具直接执行。本机界面及获授权的公网界面直接操作视为用户动作。`readonly` API 任务不向模型提供修改工具。工作区模式不是操作系统沙箱，执行仍受当前用户、系统权限和工具禁用设置限制。

MCP 连接地址和公网控制台分享链接是不同入口。分享链接通过 HTTPS 换取 HttpOnly / Secure / SameSite Cookie，HTTP 与 WebSocket 都校验身份和来源；禁止把未保护的本机控制接口直接对外发布。完整行为见 [公网远控说明](WORKSPACE-FEATURES.md)。

## WebSocket

服务端事件为 `{type,data}`，客户端发送 `{type,data,id?}`。重连后重新读取 bootstrap。

| 客户端消息 | data |
| --- | --- |
| `screen.subscribe` | `{enabled:boolean}`；仅订阅时采集桌面 |
| `terminal.create` | `{shell?,cols?,rows?}`；可用 Shell 由 bootstrap 返回 |
| `terminal.input` | `{id,text}`；命令以 `\r` 执行，Ctrl+C 使用 `\u0003` |
| `terminal.resize` / `terminal.close` | `{id,cols,rows}` / `{id}` |
| `gui.mouse` | `{action,x,y,...}`，坐标使用原始虚拟桌面坐标 |
| `mode.change` | `{mode:'safe'\|'overdrive'}` |
| `agent.run` | 网页聊天发送入口；API 模型使用 `/api/chat/send` |
| `webchat.stop` | 停止网页生成和等待 |
| `agent.stop` | 停止当前网页任务；无网页任务时停止 MCP |

主要事件包括 `service.state`、`service.log`、`tools.changed`、`tool.started`、`tool.finished`、`approval.requested`、`approval.resolved`、`terminal.output`、`screen.frame`、`webchat.state`、`message.upsert`、`models.changed`、`chat.state`、`public-access.state`、`dsh.state`、`extensions.changed`。

## 验证

运行 `npm test`、`npm run test:mcp`，构建服务包后运行 `node runtime/package-smoke.mjs`。公网门户测试使用本地隧道替身验证转发、鉴权及撤销；第三方网页和模型接口使用隔离 fixture 验证协议，不等同于真实账号的端到端验收。
