# NexusMCP Studio 0.2.0 界面接入

## 入口与状态

- `frontend/src/DesktopApp.tsx`：桌面与网页共用的导航和主界面。
- `frontend/src/components/ConversationWorkbench.tsx`：对话、模型选择、输入与时间轴。
- `frontend/src/components/ExtensionManager.tsx`：插件、技能、MCP 与 DSH 原生工作台。
- `frontend/src/components/SettingsDialog.tsx`：外观、模型、连接、权限和公网入口。
- `frontend/src/connection.ts`：HTTP 请求、WebSocket 连接与重连。
- `frontend/src/store.ts`、`session-ui.ts`：运行时事件、工作区、会话和草稿。

桌面运行 `npm run dev` 或 `START-FRONTEND.bat` / `./start-studio.sh`。Electron 启动本机运行时并使用其实际端口；运行时托管的网页版使用同源接口。静态 Pages 预览不连接运行时。

## 模型与会话

模型菜单按可折叠的 MCP / API 分类展示。网页模型使用 `/api/webchat/send`；API 模型使用 `/api/chat/send` 和 `/api/chat/stop`。配置使用 `/api/model-profiles`，不通过浏览器存储保存密钥。

消息与工具通过 `sessionId/requestId` 归属会话；草稿、模型选择和时间轴快照按会话保存。`message.upsert` 更新已有回复，时间轴使用真实记录的时间，不构造演示操作或未知耗时。

权限通过 `/api/permissions` 确认。API 只读任务不向模型提供修改工具；工作区模式采用安全审批，不是操作系统沙箱。完整 HTTP / WebSocket 契约见 [客户端接口](CLIENT-SERVICE-INTEGRATION.md)。

## 扩展管理

| 请求 | 界面行为 |
| --- | --- |
| GET `/api/extensions` | 读取 `{items:ExtensionEntry[]}` |
| POST `/api/extensions/install` | 发送本地路径、Git、包名或 MCP 地址，返回安装中的条目 |
| POST `/api/extensions/upload` | 网页上传文件，使用二进制请求体及文件名、类型等查询参数 |
| PATCH `/api/extensions/:id` | `{enabled:boolean}`，请求启用或停用 |
| DELETE `/api/extensions/:id` | 删除应用安装的副本 |

条目包含 `id/name/kind/enabled/status/error` 等字段。返回 202 只代表开始处理；界面在安装中刷新列表，以 `installed/error` 显示实际结果。桌面路径选择器只返回路径，网页使用原生文件选择器上传。格式、大小、依赖和存储规则见 [插件接口](EXTENSIONS-API.md)。

DSH 原生插件使用 `/api/dsh` 与 `/api/dsh/plugins`，在固定版本官方运行时的独立工作台执行。标准 MCP 和 SKILL.md 可直接接入当前会话。

## MCP 与公网入口

首次连接运行时后，`ensureMcpStarted()` 读取实际状态并尝试启动 MCP。自动启动与手动弹窗共享请求；用户停止后，本次客户端运行不自动重新开启。状态通过 `service.state` 更新。

MCP 弹窗显示服务返回的完整连接地址，不自行拼接域名或随机路径。公网远控设置则使用 `/api/public-access`；两种地址用途不同。远程页面不提供公网入口或 DSH 工作台管理。

## 界面与数据

工作区、会话名称、草稿和外观偏好保存为本机界面状态；执行和保存结果以运行时确认事件为准。会话导出的 ZIP 包含 `conversation.md`、`operations.json` 和 `session.json`，不包含模型密钥。

桌面与网页共用主题和动效，响应系统减少动态效果偏好。弹窗应管理焦点和关闭行为，手机浮层应避免被内容滚动容器裁剪；任何详情面板都不能遮住其所属视图的输入与操作控件。
