# 手机上查看 NexusMCP Studio 成品

本项目是 **Windows Electron 桌面软件**。手机无法直接运行 Windows EXE，但可以通过 GitHub Pages 查看 React 界面预览。

## 首次启用手机预览

1. 打开仓库的 [Settings → Pages](https://github.com/YIRT66/NexusMCP-Studio/settings/pages)。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 在 [Actions](https://github.com/YIRT66/NexusMCP-Studio/actions) 里找到 **Mobile preview (GitHub Pages)**，等运行成功，必要时点击 **Run workflow**。
4. 手机浏览器访问预览网址：**https://yirt66.github.io/NexusMCP-Studio/**。

启用后，后续推送到 `main` 会触发网页预览构建。若显示 404，检查 Actions 的部署结果和 Pages 设置；未部署成功时该网址不代表可用。

### 手机上能做什么

- 查看 UI、切换菜单、深浅色界面，以及离线状态下可交互的本地设置。
- 测试小屏布局，并在手机上截图反馈问题。

### 手机上不能做什么

- 不会连接或控制你的 Windows 电脑；网站是静态前端，没有 MCP 服务。
- 不能从网页执行真实的 PowerShell、读取本机文件或启动桌面浏览器。
- 不能直接在 Android 或 iOS 运行 Windows EXE。

## 获取 Windows 安装包

1. 打开 [Actions](https://github.com/YIRT66/NexusMCP-Studio/actions)，选择 **Build Windows desktop (EXE)**。
2. 打开成功运行的记录，在 **Artifacts** 中下载 `NexusMCP-Studio-Windows-x64`。
3. 解压后得到 `NexusMCP-Studio-Setup.exe`，留到电脑开机后安装测试。

安装包打包流程依赖 npm、Windows 运行时与 cloudflared 下载，可能遇到网络／依赖错误；只有 **构建成功且出现 Artifact** 才表示已生成安装包。构建产物不代表真实 Windows MCP 功能已通过人工验收。

## 开发者注意

- Pages 构建会设置 `GITHUB_PAGES=true`，使用 Vite 的 `/NexusMCP-Studio/` 静态资源前缀。
- `VITE_WEB_PREVIEW=true` 只给网页版本显示“预览模式”标识，不影响 Electron 桌面版本。
- 预览网页不需要账号登录；此仓库和 Pages 都是公开资源，不要将任何私密凭据写进前端源码。
