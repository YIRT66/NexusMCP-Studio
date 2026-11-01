# 网页聊天与客户端会话

聊天栏通过已登录 AI 网站的网页发送消息并读取回复，不调用模型 API，不需要 API Key。登录、验证码和账号权限在网站正常完成。原 MCP 与 cloudflared 临时公网服务继续使用，不受网页聊天传输方式影响。

## 推荐：Edge / Chrome 插件

如果内置浏览器出现 `Route Error / Invalid content type: text/html`，说明网站预期的数据被替换成 HTML 错误页。原因可能是登录、网络、站点防护或内嵌浏览器兼容性；不能仅凭此报错确定。建议使用正常浏览器登录加扩展桥接，不伪装浏览器身份或绕过验证。

1. 在客户端会话右上打开「AI 浏览器」，运行方式选「Edge / Chrome 插件」。
2. 点击「打开扩展文件夹」。在 `edge://extensions/` 或 `chrome://extensions/` 打开开发者模式，加载该文件夹。打包前源码路径为 `browser-plugin/`。
3. 在客户端点击「复制客户端连接地址」，粘贴进浏览器扩展弹窗，点击「连接客户端」。这个地址只连本机，与复制给 GPT 的公网 MCP 地址不同。
4. 在客户端点击「打开对应网页」，用网站正常方式登录。之后可收起客户端浏览器面板，在软件聊天栏连续发消息。

本机配对地址和端口会保留，浏览器扩展自动尝试重连。如果原端口被其他进程占用，客户端会换一个空闲端口，此时重新复制连接地址。扩展文件夹里是标准 Manifest V3 扩展；无需修改浏览器指纹。

## 会话规则

- 一个客户端会话对应每个 AI 网站的一个固定网页标签和对话地址。
- 同一客户端会话连续发送时，复用已绑定的标签，不打开新标签，也不跳转到新对话首页。
- 只有客户端新建会话，才为它分配新的网页标签；原会话保留。
- 切回旧会话，恢复原标签；已关闭或重启时用保存的网页对话地址恢复。
- 网站把首条消息从首页跳转到具体对话 URL 时，会自动更新绑定地址。
- 支持识别的网页对话消息会同步到客户端，包括用户在网页里直接发出的消息；回复持续更新，避免重复追加多条。
- 生成期间阻止重复发送和切换会话，支持停止生成。发送失败不会自动重复提交。

不要手动把已经绑定的网页标签改成另一个独立对话。手动导航会被视为当前客户端会话选择的新网页对话，并更新映射。

## 内置浏览器

仍可选择「内置浏览器」。它使用 Electron WebContentsView，网页与本机 UI 隔离，登录会话存在本机独立 Chromium 用户目录。网页面板收起后继续工作。客户端新建会话、旧会话恢复及对话地址绑定使用同样规则。

由于网站对浏览器环境和登录方式可能有限制，不能保证所有网站都接受内嵌 Chromium。出现登录不支持、验证码或 HTML 错误页时，可切换普通浏览器插件。

## 适配范围和限制

包含 ChatGPT、Claude、DeepSeek、Gemini、Qwen、Kimi、豆包的网页 DOM 适配器。网站改版可能使输入框、发送/停止按钮、用户消息或回复的选择器失效，失败会提示，不报告假成功。测试覆盖桥接流程和模拟各站 DOM 的页面，尚未替用户登录和逐一验证所有网站的现行账户页面。

当前发送文本和网页可读取的回复。附件需在网站完成上传后发送。网站中的模型选择、插件/MCP 应用选择、账号切换和验证仍在网页完成；客户端网站下拉菜单不等同于网站自己的模型菜单。网站回复没有向客户端开放的隐藏推理不会读取。

需要 GPT 控制电脑时，先在客户端启动 MCP，按原流程把完整临时公网 MCP 地址添加到 GPT 账户并在该网页对话中启用应用。聊天桥接本身不会自动为 GPT 账户安装 MCP 应用。

## 接口与源码

- `GET /api/webchat`：当前网站、会话、状态、传输方式。
- `POST /api/webchat/transport`：`{transport:'embedded'|'extension'}`。
- `POST /api/webchat/activate`：`{sessionId}`，选择当前客户端会话。
- `POST /api/webchat/open`：`{provider,sessionId}`，复用或首次创建会话绑定的网页。
- `POST /api/webchat/send`：`{text,sessionId,planning?,goal?,attachments?}`。
- `POST /api/webchat/stop`：停止网页回复。
- `GET /api/webchat/bridge`：本机扩展配对地址，不向公网映射。
- WS：`webchat.state`、`webchat.history`、`message.upsert`、`agent.status`。
- `desktop/webchat.cjs`：内置浏览器与会话绑定。
- `browser-plugin/adapter.js`：内置浏览器和外部扩展共用的 DOM 适配逻辑。
- `browser-plugin/background.js`：正常浏览器标签管理、会话持久化与本机桥接。
- `runtime/webchat-relay.mjs`：本机扩展配对与消息转发。

验证命令：`node scripts/test-webchat.cjs`、`node --test runtime/browser-extension.test.mjs runtime/webchat-relay.test.mjs`。前者使用隔离登录目录与本地测试网页，不访问用户已有登录账号。

真实 Edge 扩展链路验证：`node scripts/test-browser-extension.cjs`。测试在隔离浏览器目录加载 MV3 扩展，将测试域名页面替换为本地 fixture，不向真实 AI 网站发送消息。2026-11-01 已通过本机配对、连续发送、回复同步和复用标签验证。扩展成品包为 `release/NexusMCP-Browser-Extension.zip`。
