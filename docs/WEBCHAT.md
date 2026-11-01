# NexusMCP Studio 0.2.0 网页聊天

模型菜单分为「MCP 模型」和「API 模型」。本文说明使用已登录 AI 网页的 MCP 模型；API 模型在设置中填写 OpenAI 兼容地址、模型 ID 与密钥，使用方式见 [功能说明](WORKSPACE-FEATURES.md)。

## 连接 Edge / Chrome 扩展

1. 在会话右上打开「AI 浏览器」，选择「Edge / Chrome 扩展」。
2. 在 `edge://extensions/` 或 `chrome://extensions/` 开启开发者模式，加载 `browser-plugin/` 或解压后的扩展包。桌面软件可打开扩展文件夹。
3. 从客户端复制完整本机扩展连接地址，粘贴到扩展弹窗并连接。它与提供给 AI 客户端的公网 MCP 地址不同。
4. 在软件中为当前会话打开 AI 网页，完成网站登录后，返回软件发送消息。

本机配对地址形如 `ws://127.0.0.1:<port>/webchat/extension/<配对值>`，不应公开分享。端口发生变化时重新复制地址。网页绑定失效可在扩展弹窗点击「绑定当前 AI 标签页」。

## 会话与完成检测

- 同一客户端会话复用各网站已绑定的网页标签；新会话分配新标签，切回旧会话恢复原地址。
- 网站跳转到具体对话地址后会更新绑定；关闭标签、扩展重启或接收器失效时尝试恢复。
- 识别输入框时也检查 iframe。无法确认发送结果时，不自动重复发送。
- 客户端消息带有 `requestId/sessionId`，优先接收 AI 通过 `client_reply` 回传的回答，可分段更新。
- 没有 MCP 回传时，确认本轮助手正文稳定、网页停止生成后，同步最终回复；旧回复不能完成新请求。
- MCP 已回传但网页仍在生成时，先等待或点击停止，再发送下一条消息。
- 本版不把网页里任意手动发起的对话全部导入软件，回复路由以客户端当前请求为准。

## 内置浏览器

Electron WebContentsView 与应用界面隔离，登录状态保存在本机独立会话目录。收起面板后，当前网页任务继续运行。内置浏览器和扩展共用适配器、会话绑定与完成判断。

网站可能限制嵌入式 Chromium。遇到登录限制、验证码或 HTML 错误页时，可改用普通浏览器扩展，并在网站正常完成验证。

## 控制台与注入

AI 浏览器面板可读取控制台、执行 JS 和注入 JS / CSS。普通浏览器需先在扩展弹窗点击「开启网页调试」，只附加当前绑定网页。扩展在安装时声明 debugger 权限；浏览器会显示调试提示，可通过提示条或弹窗关闭。

MCP 提供 `browser_console_read`、`browser_console_control` 和 `browser_inject`，使用 `target=chat` 指向当前 AI 网页；`target=managed` 指向独立托管的浏览器。读取控制台从首次调用开始保留最近 500 条，详细操作见 [功能说明](WORKSPACE-FEATURES.md)。

## 适配范围

包含 ChatGPT、Claude、DeepSeek、Gemini、Qwen、Kimi、豆包的 DOM 适配器。网站更新可能需要调整选择器；隔离测试页面不等同于逐一验证真实账户页面。

网页附件需在网站上传；网站内的具体模型、MCP 应用、账号和验证码也在网页完成。需要网页 AI 控制电脑时，在该会话中启用软件提供的 MCP 应用。桥接不会自动替用户修改网站账户配置，也不会读取网站未提供的隐藏推理。

## 接口

| 接口 | 用途 |
| --- | --- |
| GET `/api/webchat` | 当前网页、会话、生成与就绪状态 |
| POST `/api/webchat/transport` | `{transport:'embedded'\|'extension'}` |
| POST `/api/webchat/activate` | `{sessionId}` |
| POST `/api/webchat/open` | `{provider,sessionId,url?}`，打开或复用网页 |
| POST `/api/webchat/send` | `{text,sessionId,planning?,goal?}` |
| POST `/api/webchat/stop` | 停止当前网页生成和等待 |
| GET `/api/webchat/bridge` | 获取本机扩展配对地址 |

事件包括 `webchat.state`、`message.upsert`、`client.failed` 和 `agent.status`。源码入口为 `desktop/webchat.cjs`、`browser-plugin/`、`runtime/webchat-relay.mjs` 和 `runtime/client-replies.mjs`。

验证命令与范围见 [网页聊天验证说明](WEBCHAT-QA.md)。
