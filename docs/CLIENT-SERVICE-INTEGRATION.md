# 客户端服务接入（已实现）

本任务只维护 `runtime/`、`preserved-mcp/` 及服务打包脚本。界面和 Electron 窗口由 UI 任务维护。

主流程是 **启动本机 MCP → 自动启动 cloudflared Quick Tunnel → 复制完整地址 → GPT 网页版连接 → 实时显示工具操作**。本机不调用大模型 API，不需要 API Key、Codex CLI 或 Claude CLI。`hancode_*` 工具名为兼容保留，浏览器已经改为独立管理的 Edge / Chrome，不需要原 HanCode。

插件、技能、Git/npm/PyPI 安装及外接 MCP 已实现，直接兼容 UI 的 `/extensions` 适配层，详见 [EXTENSIONS-API.md](./EXTENSIONS-API.md)。打包时 `runtime/server.mjs`、`runtime/extensions.mjs`、`runtime/extension-install.mjs` 必须同时包含；推荐直接复制服务打包目录。

## Electron 启动内置运行时

Windows 便携包目录结构保持如下。服务不应放在 asar 内运行；请作为 `extraResources` 整体复制，或复制服务打包脚本生成的目录。

```text
resources/service/
  runtime/server.mjs
  preserved-mcp/
    runtime/node.exe
    bin/cloudflared.exe
    node_modules/
    server.mjs
    tools.mjs
    browser.mjs
    page-control.mjs
    desktop.ps1
    system-worker.ps1
    其余服务源码和许可证
```

主进程使用 `spawn` 创建带 IPC 的进程。使用随包 Node，避免 Electron 的 `ELECTRON_RUN_AS_NODE` 或原生模块 ABI 差异。

```js
const {spawn} = require('node:child_process');
const path = require('node:path');
const base = app.isPackaged ? path.join(process.resourcesPath, 'service') : path.resolve(__dirname, '..');
const runtime = spawn(path.join(base, 'preserved-mcp/runtime/node.exe'),
  [path.join(base, 'runtime/server.mjs')], {
    cwd: base,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {...process.env,
      NEXUS_PORT: '0',
      NEXUS_DATA_DIR: path.join(app.getPath('userData'), 'service'),
      NEXUS_DESKTOP_ORIGIN: 'nexus://studio',
    },
  });
runtime.on('message', message => {
  if (message.type === 'runtime.ready') {
    // message.port 和 message.url 是实际本机控制端口。
    // 把 /api/* 同源转发到 message.url；通过 preload 向前端提供 WebSocket URL。
    console.log('服务控制接口就绪', message.port);
  }
});
```

`runtime.ready` 仅表示本地控制接口就绪，**不代表公网 MCP 已启动**。用户点击启动按钮后才调用 `POST /api/service/start`。关闭客户端时发送 `runtime.send({type:'shutdown'})` 并等待退出；父进程 IPC 断开也会清理服务。不要只杀 Electron 窗口而遗留服务进程。

不指定端口时默认 `127.0.0.1:8765`；指定 `NEXUS_PORT=0` 自动分配空闲端口。`NEXUS_DEV_ORIGIN` 可指定一个 Vite 来源，例如 `http://127.0.0.1:5173`。服务校验 Host / Origin，不使用通配 CORS。打包版的同源 HTTP 代理应使用实际端口；WebSocket 使用 `ws://127.0.0.1:<port>/ws`，并在 CSP 中允许该地址。普通网页端也可同源访问控制接口。

## HTTP 接口

所有请求和响应为 JSON；异常返回非 2xx 和 `{error:string}`。本机控制接口不映射公网，cloudflared 只映射子进程的随机 MCP 路径。

| 方法 / 路径 | 说明 |
| --- | --- |
| GET `/api/bootstrap` | 初始状态：`{mode,settings,service,tools,calls,logs,approvals,history,terminalId,phase,servers}` |
| POST `/api/service/start` | `{}`；立即返回 `starting`，通过 WS 等待 `running` 或 `error`，隧道最长等待约 90 秒 |
| POST `/api/service/stop` | `{}`；停止 MCP、隧道、系统工作者、托管浏览器和持久终端，返回最终状态 |
| POST 或 PUT `/api/settings` | 保存下述设置中的任意字段，成功返回完整设置 |
| GET `/api/prompt/default` | `{prompt}`，用于恢复内置默认提示词 |
| PUT `/api/tools/:name` | `{enabled:boolean}`；开启或禁用实际工具 |
| POST `/api/tools/call` | `{name,args}`；本机用户直接调用工具，返回原始 MCP `CallToolResult`；不要将此接口映射公网 |
| POST `/api/approvals/:id` | `{allowed:boolean}`；不存在或过期返回 404 |
| GET `/api/fs/list?path=...` | `{path,entries:[{name,path,directory,size?}]}`；空路径为当前用户主目录；最多 2000 条 |
| GET `/api/system/processes` | `[{pid,name,cpu,memory}]`；`cpu` 是累计 CPU 秒数，**不是使用率**，`memory` 为字节；需要 MCP 正在运行 |

`phase:'idle'`、`servers:[]` 是旧前端兼容字段；不要将它们当作本机模型引擎。本版本没有 `agent.run` 或模型聊天接口，任务由 GPT 网页版发起。

### service

```ts
type ServiceState = {
  phase:'stopped'|'starting'|'running'|'stopping'|'error';
  url:string;        // 复制给 GPT 的完整 HTTPS 地址，包含随机 /mcp/<48位十六进制>
  localUrl:string;   // 本机 MCP 调试地址；不能给 GPT 网页版使用
  error:string;
  lastClient:string;// 最近执行 initialize 的客户端名称，不能宣称它一直在线
  clientAt:number;
  startedAt:number;
  localOnly:boolean;// 仅 MCP_NO_TUNNEL=1 测试时为 true
};
```

停止或失败时清空地址。只有 `phase==='running' && !localOnly` 时才显示公网连接已就绪。不要缓存上一轮地址。连接不要求登录、OAuth 或 API Key，在 ChatGPT 中选择「无身份验证」。完全权限是工具执行策略，与身份验证是两回事。

### settings

```ts
type Settings = {
  theme:'dark'|'light'|'system';
  fontSize:12|13|14|15|16|18;
  detail:'standard'|'expanded';
  autoCollapse:boolean;
  frameRate:number;  // 0.2 到 2，默认 1，仅有桌面订阅时采集
  mode:'safe'|'overdrive';
  disabled:string[];// 禁用的实际工具名称
  prompt:string;    // 最大 30000 字符，MCP 初始化时传给客户端
};
```

Safe 模式：远程读取直接执行，其余操作等待本机审批，90 秒超时拒绝。Overdrive 模式：启用的工具自动执行。来自本机 UI 的直接点击/终端输入已有用户动作授权，不重复弹审批。所有工具权限以当前 Windows 用户为限，不会自动提权。提示词修改后需 GPT 重新初始化连接。

## WebSocket

后端事件为 `{type,data}`；前端发送 `{type,data,id?}`，`id` 目前不作为 RPC 响应关联。前端重连后重新获取 bootstrap，以恢复状态和最近记录。

### 客户端发送

| type | data |
| --- | --- |
| `screen.subscribe` | `{enabled:boolean}`，进入桌面视图 true，离开 false；默认不截图 |
| `terminal.create` | `{shell:'pwsh'|'cmd'|'bash'|'wsl',cols?,rows?}`；默认优先 PowerShell 7，缺失则回退 Windows PowerShell |
| `terminal.input` | `{id,text}`；命令加 `\r` 执行，Ctrl+C 为 `\u0003` |
| `terminal.resize` | `{id,cols,rows}` |
| `terminal.close` | `{id}` |
| `gui.mouse` | `{action:'click'|'move'|'double_click'|'right_click',x,y}`，使用原始虚拟桌面坐标 |
| `mode.change` | `{mode:'safe'|'overdrive'}`，等待服务确认事件再更新 |
| `agent.stop` | `{}`；兼容旧前端的紧急停止，效果是停止整个 MCP 服务和隧道 |

### 服务发送

| type | data |
| --- | --- |
| `service.state` | 完整 ServiceState |
| `service.log` | `{id,at,text}`，cloudflared 与服务 stdout/stderr；内存保留最近 300 条 |
| `tools.changed` | `[{name,description,readOnly,group,enabled,calls,running}]`，真实注册清单，启动前可能为空 |
| `settings.changed` | 完整设置 |
| `mode.changed` | `{mode}` |
| `history.changed` | `[{id,startedAt,label}]`，每次成功启动一条工作会话，最多 30 条 |
| `tool.started` / `tool.finished` | 下述 ToolCall；按 id 合并，不要把完成当成新调用 |
| `approval.requested` | `{id,title,description,expiresAt}`，毫秒时间戳 |
| `approval.resolved` | `{id}` |
| `approvals.clear` | `{}`，服务停止时清除等待审批 |
| `terminal.created` | `{id}`，远程 GPT 创建终端也会自动绑定到 UI 终端 |
| `terminal.output` | `{id,text}`，原始 ANSI PTY 输出，直接写入 xterm |
| `terminal.closed` | `{}` |
| `screen.frame` | `{data,width,height,x,y,timestamp}`，data 为 **PNG data URL**，x/y 可为负数，宽高为原始桌面范围 |
| `screen.clear` | `{}` |
| `cursor` | `{x,y,clickId?}`，完成鼠标操作时发送 |
| `telemetry` | `{cpu,memory}`，两者均为真实系统百分比，每 2 秒发送 |
| `error` | `{message}`，本机 WS 操作失败 |

```ts
type ToolCall = {
  id:string;source:'GPT / MCP'|'本机操作';name:string;
  input:unknown;output?:unknown;
  status:'running'|'completed'|'error';startedAt:number;endedAt?:number;
};
```

活动日志记录工具参数与结果，不读取 GPT 对话或隐藏推理。参数预览最多 10000 字符，结果最多 16000 字符，截断后可能是字符串而非 JSON。截图结果用标记代替。敏感键（password/authorization/token/secret 等）会隐藏，但终端文本和文件正文不保证自动识别所有秘密。`calls` 恢复最近 200 条，本机日志在 `NEXUS_DATA_DIR/activity.jsonl`。预览截图、后台终端增量拉取不产生工具轨迹，避免刷屏。

## 独立服务包与验证

```powershell
node scripts/package-service.mjs
node --test runtime/service.test.mjs
node runtime/public-smoke.mjs
```

服务包输出到 `release/NexusMCP-Service/`，包含随包运行时和依赖。独立运行 `START-SERVICE.bat` 仅启动本地控制接口；直接运行 `preserved-mcp/START-MCP.bat` 会立即启动 MCP 与临时隧道并打印完整地址。客户端打包可复制这个服务目录到 `resources/service`。

2026-11-01 验证：官方 MCP SDK 经真实 Quick Tunnel HTTPS 地址完成 initialize、listTools 和 computer_info 调用。没有替用户在 ChatGPT 账户中创建应用；那一步需要用户在自己的网页账户中添加完整临时地址。

官方说明：[OpenAI 自定义 MCP](https://developers.openai.com/api/docs/guides/custom-mcp-server)、[Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。Quick Tunnel 不支持 SSE，本服务使用 Streamable HTTP 的 JSON 响应模式。
