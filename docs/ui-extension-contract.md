# 插件和技能的 UI 接入

本文件描述 UI 需要的扩展管理接口。具体插件格式、依赖解析、安装、隔离与运行均由服务端实现；界面不执行安装脚本。UI 不把内置 MCP 工具开关当作插件安装。

## 前端位置

- 当前入口：`frontend/src/DesktopApp.tsx`，由 `frontend/src/main.tsx` 加载。
- 插件与技能管理：`frontend/src/components/ExtensionManager.tsx`。
- 接口适配：`frontend/src/extensions.ts`，可统一修改接口路径与数据结构。
- 设置：`frontend/src/components/SettingsDialog.tsx`。
- 桌面开发启动：上级目录 `一键启动开发版.bat` → `START-FRONTEND.bat` → `npm run dev` → Electron。

## 扩展数据

```ts
type ExtensionEntry = {
  id: string;
  name: string;
  kind: 'plugin' | 'skill' | 'mcp';
  enabled: boolean;
  description?: string;
  version?: string;
  source?: string;
  status?: 'installed' | 'installing' | 'error';
  error?: string;
};
```

| 请求 | 约定 |
| --- | --- |
| `GET /api/extensions` | 返回 `ExtensionEntry[]` 或 `{items: ExtensionEntry[]}` |
| `POST /api/extensions/install` | 接收下方安装参数，返回 `ExtensionEntry`。耗时安装应尽快返回 `status: 'installing'`；UI 每 2 秒刷新列表 |
| `PATCH /api/extensions/:id` | 接收 `{enabled: boolean}`，更新启停状态 |
| `DELETE /api/extensions/:id` | 移除扩展，返回 204 或 JSON |

```json
{
  "kind": "skill",
  "name": "可选的自定义名称",
  "source": {"type": "local", "value": "F:\\skills\\example"}
}
```

`source.type` 支持 `local`（文件或目录完整路径）、`git`（HTTPS / SSH 仓库地址）、`registry`（带来源的包名，例如 `npm:...` / `pypi:...`）、`mcp`（HTTP / HTTPS MCP 地址）。`kind: 'mcp'` 时来源使用 `mcp`。

桌面选择器仅返回用户选中的本机路径；不读文件，不触发安装。由用户点击安装后才发送接口请求。服务未连接时安装按钮不可用；接口未实现或安装失败时显示真实错误，不新增伪造的安装记录。

内置工具保留在“内置工具”分类，继续使用现有 `tools` 状态和 `POST /api/settings {disabled}` 接口。外观偏好保存在本机 `nexus.preferences`，密钥不会写入该存储。模型与权限配置继续通过 `POST /api/settings` 提交；服务端可以在此基础上适配。

桌面壳的 Vite 服务使用可用的本地端口，将 HTTP 与 WebSocket 代理到 `127.0.0.1:8765`，统一转发本机来源。此次只接入 UI，不启动或修改服务进程。

## 会话界面接入

会话界面位于 `frontend/src/components/ConversationWorkbench.tsx`，工作区与本地会话快照位于 `frontend/src/session-ui.ts`。对话、轨迹、执行详情、目标与计划模式共用实际收到的 `messages` 和 `calls` 状态，不填充演示记录。

| 请求 | UI 期望 |
| --- | --- |
| `POST /api/permissions` | `{mode:'readonly'\|'workspace'\|'full',workspace,sessionId}`；返回 `{mode}`。发送任务前会校验返回值，服务未确认时不发送任务 |
| `GET /api/models` | `[{id,name?}]` 或 `{models:[...]}`；没有列表时只显示已配置模型与管理入口 |
| `POST /api/models/select` | `{model,sessionId}`；返回 `{model}` 后才更新所选模型 |
| `POST /api/feedback` | `{sessionId,text}` |
| `POST /api/sessions/:id/compact` | 返回 `{messages}` 或 `{summary}`，不在客户端伪造压缩结果 |

`agent.run` 的 data 保留 `text`，并附带 `sessionId`、`workspace`、`permission`、`planning`、`goal`、`attachments`（本机文件路径数组）。服务必须实施相应权限和工作区边界。

原生文件选择和 ZIP 导出由 Electron 窄接口完成，不经过安装器或运行时。ZIP 包含 `conversation.md`、`operations.json`、`session.json`，不导出模型设置或 API Key。会话菜单支持文件、目标、计划、反馈、压缩、权限、模型和下载日志。

## MCP 启动与地址弹窗

顶部“启动 MCP 服务”按钮打开 `McpServiceDialog.tsx`。若控制台尚未连接，会先建立既有 WebSocket 连接；连接后只发送一次 `POST /api/service/start {}`。后续通过 `service.state` 事件读取 `phase`、`url`、`localOnly`、`error` 等真实状态。

软件首次连接运行时后会自动调用 `ensureMcpStarted()`。它先读取真实 bootstrap 状态，服务已启动时直接复用；自动启动与手动弹窗共享同一请求。用户停止后，本次软件运行不会自动重新开启。自动启动失败会显示实际错误，可从 MCP 弹窗重试。开发版 HTTP 与 WebSocket 使用同源代理，并转发实际运行时端口对应的 Host / Origin。

侧栏工作区支持折叠、新建会话、展开更多、重命名和移除；聊天菜单支持重命名和删除应用内保存的会话。删除活动会话时切换到同一工作区的其他会话，没有其他会话时新建空会话。工作区折叠与名称、聊天自定义名称随本地会话一起保存。自定义聊天名不会被后续消息覆盖。

`url` 是服务返回的完整 MCP 连接地址，UI 原样显示和复制，不自行拼接临时域名、路径或身份验证信息。运行中再次打开仅查看地址；关闭弹窗不会停止服务。停止按钮调用 `POST /api/service/stop {}`。启动与停止接口若返回 `ServiceState`，界面也立即采用该状态。
