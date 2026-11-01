# NexusMCP Studio · 独立桌面版

> 本仓库提供源代码，不包含依赖、缓存、打包产物或本地身份验证数据。克隆后请按下文执行 `npm ci` 安装依赖。

网页聊天现已接入客户端。支持内置浏览器和普通 Edge/Chrome 扩展，按客户端会话绑定网页对话，连续发消息不创建新对话。登录异常时推荐普通浏览器扩展。使用步骤见 [网页聊天说明](docs/WEBCHAT.md)，扩展包为 release/NexusMCP-Browser-Extension.zip。修改主进程或 preload 后需要完全退出并重新启动客户端。


GitHub 仓库直接以本项目为根目录，可克隆到任意本地文件夹。原 HanCode 项目保留。提供 React 18 + TypeScript + Vite 桌面和网页控制台，采用中性黑白深浅双主题、Tailwind CSS、Framer Motion、Lucide、xterm.js 与 Zustand。最终界面按用户最新参考图调整为简洁会话布局：左侧导航与当前会话，中央留白和输入框，输入框内选择模型与权限。取消灵动岛、发光球、科技感网格和宣传型标题。

## 新增功能

支持可折叠 MCP / API 模型选择、流式 API 工具调用、按轮次查看的时间轴、DeepSeek Harness 原生插件工作台、内存查询、DLL/SO 加载、浏览器控制台与 JS/CSS 注入。设置中的「公网远控」可一键建立带访问凭证的 HTTPS 分享入口。使用方式与兼容边界见 [功能说明](docs/WORKSPACE-FEATURES.md)。

## Linux 支持

Linux x64 支持源码运行、AppImage / DEB 桌面安装包及独立 MCP 服务包。安装 Node.js 24.9+ 后执行 `./start-studio.sh` 启动开发版，执行 `./build-linux.sh` 生成安装包。仅运行 MCP 可使用 `preserved-mcp/start-mcp.sh`。详细安装步骤、依赖和能力说明见 [Linux 指南](docs/LINUX.md)。

Linux 终端默认使用当前 Shell / Bash，浏览器支持 Chrome、Chromium 和 Edge。X11 桌面控制需要 `xdotool wmctrl xclip imagemagick`；Wayland 桌面控制及 Windows UIA 暂不支持，终端、文件与浏览器功能可以正常使用。

浏览器扩展 1.2 增加独立连接状态、会话网页快捷入口、可折叠网页发送区、Ctrl / ⌘ + Enter 发送和回复复制，并跟随系统深浅主题。使用步骤见 [扩展说明](browser-plugin/README.md)。

## 桌面启动与打包

软件使用 Electron 内置的 Chromium，以独立窗口运行，支持原生标题栏、最小化、最大化、关闭、单实例和窗口位置恢复。打包版直接从应用资源加载界面，不需要浏览器、Node.js 或 Vite 开发服务器。

- **开发版**：双击项目根目录的 `START-FRONTEND.bat`。首次需要安装 Node.js 24.9+ 和下载依赖，之后自动启动带热更新的桌面窗口。关闭软件会释放内部 Vite 服务；开发窗口按 F12 打开开发工具。
- **重新打包**：双击项目根目录的 `BUILD-DESKTOP.bat`，输出到 `release/`。

命令行：`npm ci` 安装依赖及 Electron 内核；`npm run dev` 启动桌面开发版；`npm run build` 构建界面；`npm start` 用桌面窗口加载构建产物；`npm run dist` 生成 Windows NSIS 安装器；`npm run pack:desktop` 生成解包目录。仅需网页调试时可用 `npm run dev:web`。

客户端现已内置启动 runtime/server.mjs，本机服务支持 MCP 启停、cloudflared 临时映射、真实终端、文件和系统控制、扩展安装及网页聊天桥接。Electron 使用动态本机端口并保存配对信息，退出时清理子进程。详见 docs/CLIENT-SERVICE-INTEGRATION.md。

当前阶段可用：新会话、导航切换、深浅主题、MCP 工具列表与开关、模式界面预览、居中分类设置窗口、插件与技能安装界面、对话与轨迹页签、工作区切换、权限菜单、会话日志 ZIP 导出、任务模板与斜杠菜单、浏览器支持时的语音输入、桌面全屏、xterm 终端渲染、真实事件驱动的卡片/审批/鼠标光标/点击水波纹。无运行时连接时明确显示离线，控制动作及保存按钮不会假装执行成功。桌面与真实网页版自动连接运行时；离线时可以点击“未连接”重试。

自然语言消息可以由已登录的 AI 网页或设置中的 OpenAI 兼容 API 模型处理。系统控制由 Node MCP 内核提供，只有安装 PyPI 扩展时需要 Python。网页聊天不会自动替用户在 GPT 账户中添加 MCP 应用，需按原流程启用该应用后才能远控。

## 迁移保留

- `preserved-mcp/` 是原 MCP 1.1.0 的完整副本，保留 Node 运行时、cloudflared、原生 PTY、Windows UIA 工作者、工具与默认提示词。未复制个人运行日志、临时公网地址或账户数据。
- 可独立运行 `preserved-mcp/START-MCP.bat`；服务使用含随机访问凭证的临时地址，电脑控制权限与当前系统用户一致。
- `hancode_*` 工具名兼容保留，底层已改为独立 Edge/Chrome 页面控制；不再要求原 HanCode 本机桥。
- `migration-reference/` 保留原本的桥接、页面结构化控制和 AI 操作页源码作为迁移参考，不参与新前端构建。
- GitHub Pages 静态预览不连接电脑控制服务；运行时托管的网页版支持真实操作。

## 工程结构

```text
NexusMCP-Studio/
├─ desktop/main.cjs                # Electron 主进程、原生窗口、本地资源和 API 代理
├─ scripts/desktop.mjs             # 桌面启动入口
├─ frontend/
│  ├─ src/
│  │  ├─ DesktopApp.tsx             # 当前桌面 UI 入口与精简导航
│  │  ├─ desktop-shell.css          # 当前桌面样式、浮层与动效
│  │  ├─ main.tsx                   # 全局 Spring / reduced motion
│  │  ├─ store.ts                   # 状态与实时事件处理
│  │  ├─ connection.ts              # HTTP + WebSocket 连接与重连
│  │  ├─ types.ts                   # 数据协议
│  │  ├─ styles.css                 # 黑白主题、布局与视觉动效
│  │  └─ components/
│  │     ├─ ThinkingOrb.tsx
│  │     ├─ ToolCallCard.tsx
│  │     ├─ LiveDesktop.tsx
│  │     ├─ CyberTerminal.tsx
│  │     ├─ SystemExplorer.tsx
│  │     ├─ CommandDock.tsx
│  │     └─ SettingsDrawer.tsx
│  ├─ package.json
│  ├─ tailwind.config.js
│  ├─ postcss.config.js
│  ├─ tsconfig.json
│  ├─ vite.config.ts
│  └─ index.html
├─ preserved-mcp/                   # 原 MCP，可继续独立运行
├─ migration-reference/             # 原 AI 模块参考源码
├─ docs/backend-contract.md         # 第二阶段对接协议
├─ START-FRONTEND.bat
├─ BUILD-DESKTOP.bat
├─ electron-builder.yml            # Windows x64 便携打包配置
├─ release/                        # 生成的 EXE 与解包目录（不入库）
├─ package.json
└─ package-lock.json
```

运行时位于 `runtime/`，由 Node.js 托管前端、API 与 WebSocket，并管理独立 MCP 子进程。

## 动效

桌面和网页共用 Framer Motion 过渡。导航与模式使用共享 layoutId，工具卡片支持 AnimatePresence 高度展开；界面遵循系统减少动效偏好。计时器显示浏览器可观测的毫秒级时间，不宣称网络工具具备微秒级精度。API Key 保存在本机运行时数据目录，不返回前端或存入浏览器。
