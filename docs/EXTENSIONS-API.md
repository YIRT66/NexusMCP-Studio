# 插件、技能与 MCP 扩展接口（已实现）

与 UI 的 `frontend/src/extensions.ts` 完全一致。服务实现位于 `runtime/extensions.mjs` 和 `runtime/extension-install.mjs`，无需改 UI 请求格式。

## 接口

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/api/extensions` | 返回 `{items:ExtensionEntry[]}`，从本机持久化索引恢复 |
| POST | `/api/extensions/install` | 接受下述安装请求，返回 202 和 `ExtensionEntry`；此时为 `installing` |
| PATCH | `/api/extensions/:id` | `{enabled:boolean}`，启用或停用；启用异步握手，停用会关闭真实 MCP 连接和进程 |
| DELETE | `/api/extensions/:id` | 结束安装、关闭连接、删除应用安装的副本；成功 204，不删除原始来源 |

安装、首次连接和重新启用都可能需要数秒。UI 轮询列表，直到 `status` 为 `installed` 或 `error`。**202 表示开始处理，不能显示为“安装成功”**。只有 MCP 握手和工具枚举成功或技能解析成功，才会显示 `installed`。失败保留错误条目供重试或移除。格式错误返回非 2xx `{error:string}`。

```ts
type InstallExtension = {
  kind:'plugin'|'skill'|'mcp';
  name?:string;
  source:{type:'local'|'git'|'registry'|'mcp';value:string};
  headers?:Record<string,string>; // 可选，HTTP MCP 的自定义请求头，不向列表回传
};
type ExtensionEntry = {
  id:string;name:string;kind:'plugin'|'skill'|'mcp';
  description:string;version?:string;enabled:boolean;
  status:'installing'|'installed'|'error';error:string;source:string;
  installedAt:number;connected:boolean;toolCount:number;skillCount:number;
};
```

`enabled` 为期望启用状态，`connected` 表示实际 MCP 连接；技能没有进程，`connected:false` 是正常状态。`status:error` 显示真实错误。完全未安装成功的包不能靠切换开关绕过安装，需移除后重新安装；已有 MCP 配置连接失败可重新启用重试。

服务通过 WebSocket 广播 `extensions.changed`（完整列表），并将扩展日志放进现有的 `service.log`。`bootstrap` 也包含 `extensions`。UI 现有的“安装中每两秒刷新”即可工作。

## 支持的安装来源

- **本地目录**：复制到应用自己的扩展目录，原目录保留。支持最多 30000 个文件、512 MB，跳过 `.git/.svn`，拒绝符号链接。
- **技能文件**：选择 `SKILL.md` 或普通 Markdown；同时复制相邻的 `references/`、`scripts/`、`assets/`。支持 YAML frontmatter 的 `name`、`description`。
- **ZIP**：自动识别单层外包目录。压缩包最多 64 MB，展开最多 256 MB、10000 条目；阻止绝对路径、`..`、盘符和反斜杠越界路径。
- **MCP JSON**：支持 `mcpServers`、`mcp` 或直接 `{url}` / `{command,args}`。相对资源建议将整个目录作为来源。
- **JavaScript / Python 文件**：作为 stdio MCP 启动入口。Node 使用内置运行时；JS 会读取相邻 `package.json` 安装声明的依赖，无声明时识别常见 SDK/Zod 引用。其他依赖请用包含 `package.json` 的目录。
- **Git HTTPS**：内置 JavaScript Git 客户端浅克隆，不依赖本机 Git。GitHub 的 Git 协议下载失败时回退到官方仓库 ZIP 快照。URL 可用 `#分支名` 指定分支。
- **Git SSH**：支持 `ssh://...` 和 `git@...`，这类来源需要本机已安装 Git 并配置 SSH；不会交互索要密码。
- **npm**：`npm:@scope/package@版本` 或 `npm:package`。使用内置 Node 和 npm 安装到扩展专属目录，不要求全局 npm。
- **PyPI**：`pypi:package==版本`，创建独立 venv 后安装 wheel。需要本机 Python 3.11+ 或 `NEXUS_PYTHON_PATH`。不会修改系统 Python 环境。
- **HTTP / HTTPS MCP**：完成远程 MCP 握手并枚举工具。支持 Streamable HTTP；对返回 404/405 的旧服务尝试 SSE。

Node 依赖安装跳过生命周期脚本，PyPI 使用 wheel，不执行源码构建。安装插件并启用会启动插件声明的 MCP 程序，以当前用户权限运行。普通 npm/PyPI 库如果没有 MCP 或技能入口，会返回明确错误，不会伪装成可用插件。

## 插件目录格式

优先读取 `nexus-plugin.json`；也识别 `plugin.json`、`.claude-plugin/plugin.json`、`.codex-plugin/plugin.json` 的元信息，以及 `.mcp.json` / `mcp.json` 中的 MCP 连接。`skills/` 等目录内的 `SKILL.md` 自动发现（最多 200 个、深度 6）。

最小 Node MCP 插件可由以下三个完整文件组成：

`nexus-plugin.json`：

```json
{
  "name": "我的回显插件",
  "description": "通过 MCP 回显输入",
  "version": "1.0.0",
  "mcp": {"command": "node", "args": ["server.mjs"]}
}
```

`package.json`：

```json
{
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.32.2",
    "zod": "3.25.76"
  }
}
```

`server.mjs`：

```js
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
const server = new McpServer({name:'echo-plugin',version:'1.0.0'});
server.registerTool('echo', {
  description:'回显输入文本',
  inputSchema:{text:z.string()},
  annotations:{readOnlyHint:true},
}, async ({text}) => ({content:[{type:'text',text}]}));
await server.connect(new StdioServerTransport());
```

选择这个目录安装即可自动安装依赖并启动 MCP。也支持 `package.json` 的 `nexusMcp` 配置或 `bin`（选择第一个 CLI）；CLI 需要额外参数时请通过 `nexus-plugin.json` 显式配置。

多个服务可用 `.mcp.json`：

```json
{
  "mcpServers": {
    "local": {"command":"node","args":["${PLUGIN_DIR}/server.mjs"]},
    "remote": {"url":"http://127.0.0.1:9000/mcp"}
  }
}
```

stdio 配置支持 `command,args,env,cwd`，模板支持 `${PLUGIN_DIR}`、`${NODE}`、`${PYTHON}`。`node` 映射内置 Node，`npm/npx` 映射内置 npm。`cwd` 省略时为插件目录；相对 cwd 限于插件目录内。自定义解释器需要当前电脑可执行。单个插件最多 20 个 MCP 服务，每个服务最多 500 个工具。

## 技能对 GPT 的实际生效方式

启用后，技能出现在 MCP 的 `skills_list`。GPT 通过 `skill_read({id})` 获取主说明，通过 `skill_read({id,relativePath:'references/guide.md'})` 按需读取资源。停用后立即从列表撤下，旧 ID 也不能继续读取。

技能是工作方法和附带资源，不是安装后自动执行的脚本，也不代表本机内置了大模型。GPT 仍在网页对话中接收用户任务，再调用当前 MCP 工具执行。

外接 MCP 工具以 `ext_<扩展前缀>_<散列>_<原工具名>` 注册，防止重名；调用会转发到真实 MCP 客户端，返回真实结果，并进入同一操作轨迹。逐次审批模式下，外接工具一律审批。已安装的第三方工具不能用 `readOnlyHint` 自行绕过审批。

外接工具变动会立即反映在 `tools/list`。GPT 网页可能缓存应用工具列表，新增/移除工具后可重新连接应用刷新。

## 存储与清理

所有副本和索引在 `NEXUS_DATA_DIR/extensions/`。删除只作用于按 UUID 创建的应用安装目录，保留原本地目录、ZIP 和 Git 远端。停用关闭真实 stdio 进程或 HTTP 会话。停止 MCP 会暂停外接连接；再次启动会恢复启用的扩展。退出运行时会结束安装任务、关闭连接及子进程。

测试：`node --test runtime/extensions.test.mjs` 验证本地技能/资源、ZIP 越界拒绝、stdio/HTTP MCP 真实转发、审批、进程启停、移除和持久化。`node runtime/extensions-network-smoke.mjs` 验证 Git/npm/PyPI 真实网络安装与 MCP 调用。
