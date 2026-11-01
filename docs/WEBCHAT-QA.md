# NexusMCP Studio 0.2.0 网页与模型验证

## 自动验证

| 命令 | 覆盖范围 |
| --- | --- |
| `node scripts/test-embedded-webchat.mjs` | 真实 Electron 内置网页：MCP 提前回传时的发送保护与停止、控制台、JS / CSS、iframe 与最终回复同步 |
| `node scripts/test-browser-extension.mjs` | 真实 Manifest V3 扩展：配对、发送、会话标签、iframe、DOM 完成回退、控制台和注入 |
| `node scripts/test-webchat.cjs` | 内置网页测试的兼容命令入口 |
| `node scripts/test-extension-popup.mjs` | 扩展深浅主题、连接校验、发送、停止、复制与失败草稿 |
| `node scripts/test-workbench-ui.mjs` | 实际 API 工具循环、模型选择、时间轴交互、手机布局、公网设置与文件上传 |
| `node --test runtime/reply-completion.test.mjs runtime/browser-extension.test.mjs runtime/webchat-relay.test.mjs` | 本轮归属、稳定完成、回复防重、标签隔离与断线错误 |
| `node --test runtime/api-models.test.mjs runtime/api-integration.test.mjs` | 流式 API、工具调用、审批、取消和密钥不回传 |

浏览器测试需要安装 Chromium，Electron 测试需要图形桌面；Linux 可在 Xvfb 与窗口管理器下运行。测试使用隔离配置目录、本地模型接口和网页 fixture，不访问用户已有账户。

## 人工检查

- 在真实网站正常登录，检查输入框、发送和停止按钮，以及当前会话的回复。
- 同一客户端会话连续发送、收起浏览器后继续、切回旧会话，确认绑定和内容归属正确。
- 检查未登录、禁用发送、网页关闭、网络中断及站点改版时的提示。
- 分别检查 MCP 回传、网页最终回复回退，以及回传早于网页生成结束的情况。
- 检查内置视图的位置、缩放，以及设置或其他页面打开时原生视图的隐藏。
- 检查控制台启停、浏览器调试提示、脚本副作用和注入移除范围。
- 在目标 Windows / Linux 安装包上核对启动、退出、桌面能力及实际网站登录兼容性。

## 结果边界

自动测试证明相应本地链路和协议行为，不代表已经逐一登录并验收所有第三方网站的当前版本。真实账号权限、验证码、网站保护和浏览器策略仍需人工确认。

应用、服务包和扩展由构建工作流生成；仅在对应工作流成功且存在 Artifact 时才提供该构建的下载。界面截图分别输出到 `output/workbench-ui/`、`output/extension-ui/` 和 `output/linux-desktop/`，不把截图当作功能执行证据。
