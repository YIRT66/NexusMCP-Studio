# Studio 全权扩展（0.3.1）

Studio 扩展可以直接修改软件界面、挂载启动动画与桌宠、注册聊天回复组件、增加 AI 工具和插入工具执行中间件。前端运行在软件页面内，后端运行在本地 Node 运行时内；后端可使用 Node 文件、进程等 API。调用内置工具时沿用软件实际系统身份，Linux 完全控制授权后可通过电脑控制工具操作 root 权限资源。

这是应用层与运行时扩展接口，不是 Linux 内核模块。安装和启用即允许插件执行本地代码；界面以「Studio · 全权」标识。已启用的前端扩展随桌面与公网界面一起加载。

## 最小目录

```text
my-plugin/
  nexus-plugin.json
  ui.mjs
  backend.mjs
  style.css
```

```json
{
  "name": "我的工作空间",
  "version": "1.0.0",
  "studio": {
    "permissions": ["full"],
    "frontend": "ui.mjs",
    "backend": "backend.mjs",
    "styles": "style.css"
  }
}
```

可通过本地文件夹、ZIP 或 Git 安装。入口为相对路径；frontend/backend/styles 可以按需省略，但至少提供一个入口。标准 MCP 和技能格式保持兼容。

## 前端 `activate(api)`

导出 `activate(api)`，返回清理函数。可直接使用 DOM；界面关闭、禁用、卸载、重新启用时会处理生命周期。

| API | 用途 |
| --- | --- |
| `api.store` | Zustand 运行时状态：getState/setState/subscribe |
| `api.sessions` | 会话、工作区、草稿及本地 UI 状态 |
| `api.request(path, body?, method?)` | 调用本机 `/api` 接口，path 不含 `/api` |
| `api.send(type, data?)` | 发送本机 WebSocket 指令 |
| `api.registerComponent(type, renderer)` | 注册 nexus-ui 组件，renderer 接收 JSON 和 DOM 容器，可返回清理函数 |
| `api.mountOverlay(element)` | 挂载任意浮层/桌宠，停用时自动移除 |
| `api.on(type, handler)` | 订阅 window 事件，停用时自动移除 |
| `api.openPreview(path)` | 打开文件预览器 |

应在清理函数取消计时器、取消订阅并删除自行挂载的节点。自动注册的组件、浮层和事件监听也会清理。前端模块应使用浏览器支持的 JS，不直接导入 JSX/TS 源文件；需要构建的项目先产出模块。

## 后端 `activate(api)`

| API | 用途 |
| --- | --- |
| `api.id / api.directory` | 实际安装标识和目录 |
| `api.callTool(name, args)` | 调用内置工具，使用当前电脑控制服务身份 |
| `api.registerTool(definition, handler)` | 注册 AI 工具，自动加扩展 ID 前缀；handler 返回 MCP content 结构 |
| `api.useToolMiddleware({beforeTool, afterTool})` | 读取/改写调用参数及结果；beforeTool 可返回调用补丁，afterTool 可返回替代结果 |
| `api.emit(type, data)` | 发布实际扩展状态/事件 |
| `api.readSettings() / api.updateSettings(body)` | 读取和修改运行时设置 |

中间件回调接收 `{name,args,origin,sessionId,requestId,...}`。通过自身 `api.callTool` 发起的调用会跳过自己的中间件，避免自动递归。工具停用后会从 MCP 目录撤销。

完整示例：[studio-delight](../examples/studio-delight/nexus-plugin.json)。插件页的「安装启动动画 / 桌宠示例」可安装该示例，验证浮层拖动、跟随任务状态、后端工具、中间件以及 `workspace-note` 自定义回复组件。

## 项目工具与聊天组件

- `workspace_read`：一次返回项目源码快照，自动跳过依赖/构建/二进制，按 maxFiles/maxBytes 分页，沿 nextCursor 继续；小文件只读取一次并返回 hash。文件树短时缓存，内容实时读取。API/扩展通道会进一步限制页大小，防止传输静默截断。
- `workspace_batch`：按顺序执行 read/list/mkdir/write/patch，默认遇错停止。整个批次共享一次审批，已完成的步骤保留，不承诺跨文件回滚。
- `command_run`：一次返回 stdout/stderr/exitCode/durationMs，支持超时与任务取消；交互任务仍使用 PTY。

内置 nexus-ui 类型：card、table、metrics、chart、callout、details、tabs、steps、progress、files、diff。JSON 不直接执行 HTML/JS；已启用全权插件可注册额外类型。文件工具自动返回真实增删行和有界差异预览。无法完成精确差异计算时显示估计标识。
