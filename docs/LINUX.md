# NexusMCP Studio 0.3.0 Linux 运行与打包

支持 Linux x64，持续集成在 Ubuntu 22.04 构建 AppImage、Debian 安装包及独立 MCP 服务压缩包。Windows 与 Linux 共用客户端与动效。

## 从源码运行

建议使用 Node.js 24.9+ 与 npm（DSH 原生引擎要求 24.9+），桌面版还需要图形环境。克隆项目后执行：

```bash
npm ci
npm ci --prefix preserved-mcp --omit=dev --no-audit --no-fund
./start-studio.sh
```

`start-studio.sh` 启动 Electron 开发窗口。也可以先 `npm run build`，再 `npm start` 运行构建后的界面。首次使用需要能下载 npm 依赖及 Electron。

仅运行 MCP（不需要 Electron 或图形桌面）：

```bash
cd preserved-mcp
./start-mcp.sh
```

仅运行客户端本地服务接口：

```bash
npm run build
npm run service:start
```

默认监听 `http://127.0.0.1:8765`，服务端初始 MCP 停止，网页连接后会尝试自动启动；也可通过 MCP 弹窗或调用 `POST /api/service/start`。客户端服务数据默认保存在 `${XDG_DATA_HOME:-~/.local/share}/nexusmcp-studio`，可用 `NEXUS_DATA_DIR` 覆盖。Electron 使用自身用户数据目录下的 `service/` 保存数据。

## 安装包与独立服务包

在 Linux x64 上执行：

```bash
./build-linux.sh
```

脚本安装依赖，复制当前 Node 运行时，下载并校验 cloudflared，然后输出：

- `release/NexusMCP-Studio-<版本>-x86_64.AppImage`
- `release/NexusMCP-Studio-<版本>-amd64.deb`
- `release/NexusMCP-Service/`：包含独立 Node、原生 PTY、MCP 依赖与 cloudflared。

```bash
chmod +x NexusMCP-Studio-*.AppImage
./NexusMCP-Studio-*.AppImage
# Debian / Ubuntu 也可安装 DEB
sudo apt install ./NexusMCP-Studio-*.deb
```

AppImage 需要发行版的 FUSE 2 支持（Ubuntu 22.04：`libfuse2`；较新 Ubuntu：`libfuse2t64`）。无 FUSE 时可运行 `./NexusMCP-Studio-*.AppImage --appimage-extract`，再运行 `squashfs-root/AppRun`。请以普通桌面用户启动应用。

独立服务包可通过 `node scripts/package-service.mjs --zip` 生成 `release/NexusMCP-Service.tar.gz`。解压后运行 `./start-mcp.sh` 直接启动 MCP，或 `./start-service.sh` 启动客户端本地接口。包内附带 Node，不要求目标电脑另外安装 Node 或 npm。服务包和原生 PTY 必须在目标系统及架构构建，不能直接复制 Windows 服务包到 Linux。

GitHub Actions 的「Linux desktop and MCP service」会在 PR 和 main 推送时验证并构建桌面安装包、服务包及浏览器扩展 ZIP，可在运行结果的 Artifacts 中下载。

## Linux 控制能力

### 完全控制与系统授权（0.3.0）

会话权限选择「完全权限」后，软件自动请求 `pkexec` 系统授权。完成桌面认证后，MCP 的文件、PTY、系统和进程操作由 root 控制服务执行；Electron、普通浏览器及外接插件管理仍属于桌面用户。聊天栏的「root 已授权」来自服务实际身份。Windows 的完全权限仍表示免除工具逐次审批，不自动授予管理员身份。

Debian/Ubuntu 需要 polkit（`policykit-1` 或发行版对应的 `polkitd`/`pkexec` 包）和运行中的桌面认证代理。没有认证代理、未安装 pkexec 或用户取消时，软件报告失败并恢复普通服务。切换权限会重启 MCP，因此公网 MCP 地址会改变，需要重新连接；原终端会关闭。无需将整个 Electron 以 root 启动，无需关闭浏览器沙箱，也不会保存密码或修改 sudoers。

### 文件与终端效率

大文件用 `file_read({path,startLine:1,maxLines:200,maxBytes:65536})`，沿返回的 `nextLine` 继续；单行超过字节限额会返回 `oversizedLine`，可增加 `maxBytes` 或通过终端读取。`file_read({path,includeHash:true})` 返回整文件文本及 SHA-256，传给 `file_patch`/`file_patch_many` 的 `expectedHash` 可检测旧版本。多文件读取使用 `file_read_many`；同文件多次修改使用 `file_patch_many`。批量修改按顺序匹配，任何匹配失败均不写入。

`terminal_read` 使用 `cursor`、`limit` 和 `waitMs`，若 `hasMore` 为真则继续增量读取。`terminal_signal` 的 `interrupt` 中断前台程序，`eof` 发送 EOF，`suspend` 暂停前台作业（支持作业控制的 shell 中可用 `fg` 恢复）。输入送达与命令完成仍是两件事，需检查输出和退出状态。

| 能力 | 支持情况 |
| --- | --- |
| MCP、临时 HTTPS 隧道、客户端、文件、审批、插件与技能 | 支持 |
| 持久 PTY | 默认当前 `$SHELL`，回退 Bash / sh；可指定已安装的 shell |
| 浏览器 DOM、截图、表单与网页聊天扩展 | 支持 Chrome、Chromium、Edge；独立浏览器可无头运行 |
| 内存与动态库 | 支持统计、区域和指定地址读取；SO 加载需要 gdb 及系统允许的调试权限 |
| 进程与磁盘读取 | 使用 `ps`、`df`，支持筛选和分页 |
| TCP 连接读取 | 需要 `ss`（`iproute2`） |
| 系统服务读取 | 需要正在运行的 systemd；容器可能没有 systemd |
| 桌面截图、键鼠、窗口与剪贴板 | 支持已登录的 **X11 / Xorg** 会话，需要以下工具 |
| Wayland 桌面控制 | 暂不支持；可登录 Xorg 会话，或使用终端、文件和浏览器工具 |
| Windows UIA 控件读取与操作 | Windows 专属；Linux 浏览器请使用页面结构化工具 |

Debian / Ubuntu 的可选桌面依赖：

```bash
sudo apt install xdotool wmctrl xclip imagemagick iproute2 gdb
```

桌面操作需要 `DISPLAY` 和当前桌面的访问权限，窗口管理器需要支持 EWMH。`computer_info` 返回会话类型、桌面和可访问性能力。无桌面会话会返回具体错误，其他 MCP 工具仍可运行。

Linux `desktop_action` 的 `keys` 使用 xdotool 键名，例如 `ctrl+l`、`Return`、`alt+Tab`；Windows 继续使用 SendKeys。`type` 通过临时剪贴板粘贴支持中文，并恢复原剪贴板文本。

浏览器会依次查找已安装的 Chrome、Chromium 和 Edge。自定义路径用 `NEXUS_BROWSER_PATH=/绝对路径/浏览器`。服务器无图形会话时设置 `NEXUS_BROWSER_HEADLESS=1`。cloudflared 优先使用随包文件，也可用 `CLOUDFLARED_PATH` 指定；源码运行时缺少 cloudflared 会从官方发布下载并校验 SHA-256。

## 验证

```bash
npm run typecheck
npm test
npm run test:mcp
node scripts/test-extension-popup.mjs
node runtime/package-smoke.mjs  # 先构建独立服务包
```

X11 测试可在真实桌面运行，也可用 `xvfb-run` 与窗口管理器运行。无桌面环境的测试会验证明确的能力限制。扩展 UI 测试会生成 `output/extension-ui/` 下的深浅主题截图，使用本地 AI 页面状态模拟，不访问真实账号。

## 网页与公网远控

运行时托管构建后的网页版；设置中可开启带访问凭证的 HTTPS 分享入口。手机可通过该链接远控本机。API 模型、内存与浏览器调试、DSH 原生工作台的使用方式见 [功能说明](WORKSPACE-FEATURES.md)。
