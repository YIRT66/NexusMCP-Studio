# NexusMCP Studio

NexusMCP Studio 0.3.0 是支持 Windows、Linux 的桌面与网页工作空间。通过已登录的 AI 网页或 OpenAI 兼容 API 处理任务，使用 MCP 操作电脑，并查看对话、工具执行、审批和时间轴。

当前版本：桌面与网页客户端 **0.3.0**，电脑控制内核包 **1.4.0**，浏览器扩展 **1.3.0**。仓库提供源代码；依赖、安装包、账户状态和本机数据不提交到 Git。

安装包见 [0.3.0 Release](https://github.com/YIRT66/NexusMCP-Studio/releases/tag/v0.3.0)，新功能与系统授权说明见 [版本说明](docs/releases/0.3.0.md)。

## 当前功能

- **MCP / API 模型**：输入框中按分类展开选择；API 支持流式回复、工具调用、停止和本机密钥保存。
- **网页聊天**：内置浏览器与 Edge / Chrome 扩展，按客户端会话绑定对话；支持 iframe 识别、MCP 回复回传和网页最终回复同步。
- **执行时间轴**：按轮次查看输入、助手回复与工具调用，支持时间比例、缩放、拖选、搜索、折叠及输入输出详情。
- **电脑控制**：文件、持久终端、系统信息、窗口、桌面截图与键鼠；Windows 提供 UIA，Linux 桌面控制支持 X11。
- **调试工具**：进程内存查询、Windows DLL / Linux SO 加载、浏览器控制台、JS / CSS 注入，沿用当前系统用户权限。
- **扩展**：本地文件、ZIP、Git、npm、PyPI、HTTP / stdio MCP、SKILL.md，以及独立的 DeepSeek Harness 原生插件工作台。
- **公网远控**：设置中一键建立 HTTPS 分享入口，提供带访问凭证的链接，支持关闭入口和撤销远程连接。
- **界面**：深浅主题、共享动效、系统减少动态效果偏好、手机布局和网页版文件上传。

详细用法与兼容范围见 [功能说明](docs/WORKSPACE-FEATURES.md)。

## 安装包

在 [GitHub Actions](https://github.com/YIRT66/NexusMCP-Studio/actions) 中选择成功的构建，在 Artifacts 下载：

| 平台 | 工作流 | 产物 |
| --- | --- | --- |
| Windows x64 | Build Windows desktop (EXE) | `NexusMCP-Studio-Setup.exe` |
| Linux x64 | Linux desktop and MCP service | AppImage、DEB、独立服务压缩包、浏览器扩展 ZIP |

只有工作流成功且显示 Artifact 时，才表示对应安装包已生成。打包版附带 Node 运行时与 MCP 依赖。

## 从源码运行

使用 Node.js 24.9+ 与 npm；构建工作流使用 Node.js 24.19.0。

```bash
npm ci
npm ci --prefix preserved-mcp --omit=dev --no-audit --no-fund
npm run dev
```

Windows 可运行 `START-FRONTEND.bat`；Linux 可运行 `./start-studio.sh`。修改 Electron 主进程或 preload 后，需要完全退出并重新启动软件。

```bash
npm run build          # 构建界面
npm start              # 用桌面窗口打开构建产物
npm run service:start  # 托管真实网页版，默认 http://127.0.0.1:8765
```

网页版与桌面版自动连接本机运行时。API 模型在设置中配置；网页模型的登录、验证码和网站内的模型选择在对应网站完成。需要网页 AI 调用电脑工具时，仍需在该对话中启用 MCP 应用。

## 打包

在目标系统及架构上准备运行时，再构建：

```bash
npm run prepare:runtime
npm run dist            # Windows NSIS 安装器
npm run dist:linux      # Linux AppImage / DEB
npm run build:browser-extension
node scripts/package-service.mjs --zip
```

Windows 也可运行 `BUILD-DESKTOP.bat`，Linux 可运行 `./build-linux.sh`。产物输出到 `release/`。

Linux X11 桌面控制需要 `xdotool wmctrl xclip imagemagick`，网络连接读取需要 `iproute2`，SO 加载需要 `gdb`。Wayland 桌面键鼠与 Windows UIA 不适用于 Linux；终端、文件及浏览器工具可独立使用。详见 [Linux 指南](docs/LINUX.md)。

## 使用说明

- [网页聊天与浏览器扩展](docs/WEBCHAT.md)
- [独立电脑控制服务](docs/SERVICE-README.md)
- [客户端服务接口](docs/CLIENT-SERVICE-INTEGRATION.md)
- [插件与技能格式](docs/EXTENSIONS-API.md)
- [手机访问与静态预览](docs/MOBILE-PREVIEW.md)

公网远控链接授予当前工作空间的控制权限，只应分享给可信人员。关闭入口会断开连接，并停止该入口的 API 任务和终端；已完成的系统修改不会回滚。API Key 保存在本机运行时数据目录，不写入浏览器存储。

## 工程结构

```text
NexusMCP-Studio/
├─ desktop/                  # Electron 窗口、原生浏览器与 preload
├─ frontend/src/             # React 界面、会话状态、主题和动效
├─ runtime/                  # HTTP / WebSocket、模型、扩展与公网入口
├─ preserved-mcp/            # 电脑控制内核与平台工具
├─ browser-plugin/           # Edge / Chrome Manifest V3 扩展
├─ scripts/                  # 开发、打包和集成验证
├─ docs/                     # 使用说明与接口文档
├─ electron-builder.yml      # Windows / Linux 打包配置
└─ release/                  # 本机构建产物，不入库
```

## 验证

```bash
npm run typecheck
npm test
npm run test:mcp
node scripts/test-workbench-ui.mjs
node scripts/test-extension-popup.mjs
node scripts/test-browser-extension.mjs
node scripts/test-embedded-webchat.mjs
```

桌面测试需要相应图形环境，浏览器测试需要安装 Chromium。验证范围和人工检查项见 [网页聊天验证说明](docs/WEBCHAT-QA.md)。界面时间以实际记录为准，缺失的开始或结束时间不会推算。
