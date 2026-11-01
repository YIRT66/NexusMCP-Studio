# NexusMCP Studio 0.2.0 手机访问

手机可以打开真实远控网页，也可以查看 GitHub Pages 的静态界面预览。Windows EXE 和 Linux 安装包需要在对应电脑上运行。

## 访问真实远控网页

1. 在电脑运行 NexusMCP Studio，打开「设置 → 公网远控」。
2. 点击「开启公网访问」，等待出现完整 HTTPS 分享链接。
3. 用手机浏览器打开该链接，访问同一设备的工作空间、桌面、终端和其他已启用功能。

分享链接包含访问凭证，持有人拥有远控权限。关闭入口会断开连接并撤销该链接；再次开启生成新链接。手机页面提供侧栏、模型选择、时间轴、详情弹层与文件上传。功能边界见 [公网远控说明](WORKSPACE-FEATURES.md)。

## GitHub Pages 静态预览

静态预览地址：**https://yirt66.github.io/NexusMCP-Studio/**。

首次启用时，在仓库 [Settings → Pages](https://github.com/YIRT66/NexusMCP-Studio/settings/pages) 的 Source 中选择 GitHub Actions，再查看 **Mobile preview (GitHub Pages)** 工作流。之后推送 `main` 会触发构建；地址是否可访问，以部署结果为准。

静态预览只用于查看布局、主题和离线交互，没有运行时，不能控制电脑、执行终端或连接真实模型。

## 电脑安装包

在 [Actions](https://github.com/YIRT66/NexusMCP-Studio/actions) 的成功运行中下载 Artifact：

- **Build Windows desktop (EXE)**：`NexusMCP-Studio-Windows-x64`，内含 `NexusMCP-Studio-Setup.exe`。
- **Linux desktop and MCP service**：`NexusMCP-Studio-Linux-x64`，包含 AppImage、DEB、独立服务包和扩展 ZIP。

只有成功构建且显示 Artifact 时，才表示安装包已生成。安装包仍需在目标电脑核对系统权限和桌面环境。

## 预览构建配置

`GITHUB_PAGES=true` 设置静态资源前缀，`VITE_WEB_PREVIEW=true` 启用离线预览标识并停用运行时自动连接。真实远控网页由运行时托管，使用受保护的 HTTPS 入口，不使用 Pages 承载设备控制。
