# 原生插件兼容范围

NexusMCP Studio 是独立软件。主程序嵌入官方 `@deepseek-ai/dsh@0.2.1-rc.5` 的 Cordis、模块加载器、React、槽位、设置服务、工具调度和会话持久化；自己的聊天界面装配进同一个原生根窗口。没有单独的 DSB/DSH 工作台页，也没有修改上游仓库。

| 项目 | 0.3.3 验证范围 |
| --- | --- |
| 原生 host / Cordis bundle | 安装、实际挂载、卸载、退出清理 |
| 原生工具 | `dsh_tools_list` / `dsh_tool_call` 进入官方工具注册与执行管线；真实自定义工具测试 |
| 原生客户端 | 官方模块加载器、共享 React、布局根、overlay 与原生设置 |
| 鲸鱼娘 | `Sutera-Diffusus/dsh-whale-musume@2.5.0`：桌宠、启动表现、设置、安装/启停/卸载、主窗口与预览共存 |
| 会话 | 官方 Session 生命周期和增量 `plugin:nexus.delta` 记录；JSON 投影可重建，关闭/重启后可读取 |
| 网页分享 | 主窗口、原生资源、主程序 WebSocket 和官方 SDK WebSocket 均经过分享鉴权 |

鲸鱼娘上游未声明支持 rc.5，因此使用范围固定的 `nexus-certified-whale` 适配包：host 直接导出上游实现，客户端只替换模块注册 ID。保留完整上游代码和 MIT 许可，不全局忽略引擎兼容检查。安装其他鲸鱼娘版本会明确拒绝，不会悄悄替换成 2.5.0。

Nexus 的 API/网页任务编排仍由主程序管理。只挂在官方 agent loop 内部的 persona、模型采样或上下文加工钩子，不等同于已经适配 Nexus 的模型编排；需要这类能力的插件应单独验证。原生 Session 里 Nexus 的消息事实使用插件记录保存，依赖官方标准消息表面的投影插件可能需要专门适配。未列出的插件与未来版本不视为已认证。

安装来源仍是插件页中的本地目录、ZIP、Git 或 npm。发现包声明 `dsh` 后进入官方运行时，不再提示打开另一个工作台。旧安装会纳入统一列表，来源文件保留。原生插件更新会保存当前草稿再重载客户端；正在执行的任务结束或停止后才能更新。

引擎随安装包/服务依赖提供，`DSH_HOME` 在 Nexus 数据目录的 `dsh/home`，与用户自己的 DSH 隔离，并关闭遥测。首次装配本地插件的依赖需要 npm 网络可用；安装脚本默认禁用。全权扩展沿用当前进程的操作系统权限，系统认证仍由 Windows/UAC 或 Linux/polkit 处理。

验证入口：`runtime/dsh-native.test.mjs`、`scripts/test-harness-ui.mjs`、`scripts/test-public-native-ui.mjs`。客户端根槽位装配依赖固定版本的 StoredEntry，升级官方引擎时必须重跑这些测试。
