# HachiOrb · Codex / Cursor / Grok Bot 集成

本项目只监听 `127.0.0.1`，本地状态事件由 Hook/CLI 在**你自己的电脑上**发送。
不上传聊天记录、API Key、完整 prompt、思维过程和输出内容。状态只有：`idle`、`thinking`、`working`、`done`、`error`、`sleep`，可选任务短标签。

## 1. 一键配置 Codex + Cursor（Windows）

先启动 HachiOrb，再双击仓库根目录的 `setup-agent-hooks-windows.bat`。
它只修改当前 Windows 用户：

- `%USERPROFILE%\.codex\config.toml`：没有 `notify` 时才添加；如已有 `notify`，**不覆盖**，打印合并提示；已有配置先复制 `.hachiorb-backup`。
- `%USERPROFILE%\.cursor\hooks.json`：保留原来的其他 Hook，去重添加五种观察事件，修改前复制 `.hachiorb-backup`。

配置后重启/重开相关 Codex、Cursor Agent 会话，进行一次测试。不会自动向其他项目提交代码。关闭 HachiOrb 后 Hook 会快速跳过，不会向远程服务器发送状态。

### Codex

Codex 当前官方 `notify` 仅在 `agent-turn-complete` 时调用外部命令，因此 **自动获得的是每轮任务完成状态**，不能凭这个接口判断工作中/思考中。请勿把桌宠始终显示「待机」误认为连接失败。

如希望 CLI **进程级** `thinking / working / done / error`，可显式通过自定义 wrapper 启动 Codex；不过 interactive CLI 退出不代表每轮都完成，推荐直接用官方 `notify`。

官方文档：https://learn.chatgpt.com/docs/config-file/config-advanced#notifications

### Cursor

`~/.cursor/hooks.json`（系统根据用户 HOME 自动定位）配置如下观察事件：

| Cursor 事件 | HachiOrb 显示 |
| --- | --- |
| `beforeSubmitPrompt` | 思考中 |
| `afterAgentThought` | 工作中 |
| `afterFileEdit` | 工作中 |
| `stop` + `completed` | 完成 |
| `stop` + `error` | 出错 |
| `stop` + `aborted` | 待机 |
| `sessionEnd` | 待机 |

Hook 忽略 prompt、agent 思维和文件内容，仅使用事件类别、状态和可选工作区名称。`beforeSubmitPrompt` 始终返回 `{ "continue": true }`，不会阻止正常使用。

官方文档：https://cursor.com/docs/hooks

## 2. Grok Bot

目前 Grok Bot 官方未提供与 Codex `notify`/Cursor Hooks 同等的**本地桌面任务状态回调**，因此不声称能自动跟随你在 Grok Bot GUI 中任意创建的任务。

### 方式 A：从本机命令/自动化主动发状态（无需第三方依赖）

在 HachiOrb 运行时执行：

```powershell
node .\integrations\grok-bot-event.cjs thinking "正在分析任务"
node .\integrations\grok-bot-event.cjs working "Grok Bot 正在处理"
node .\integrations\grok-bot-event.cjs done "已核实 Grok Bot 完成"
```

可在你自己控制的自动化中触发以上命令。

### 方式 B：社区 Grok Bot CLI 的显式发送包装（可选）

第三方社区项目 `grok-bot-cli` 可向 Grok Bot 发送消息，需要你已安装且登录 Grok Bot Desktop；它不是 Grok Bot 官方事件 API。

```powershell
npm install --global grok-bot-cli
node .\integrations\gbot-send.cjs Researcher "总结项目进度"
```

包装器在调用 `gbot send` 前显示“思考中”；CLI 发送成功后显示“已提交给 Grok Bot／处理中”。**发送成功不表示云端任务已经完成**，也不替你批准任何操作。完成时需有你自己信任的确认来源，再调用 `grok-bot-event.cjs done`。不读取 Grok Bot 私有数据库，不强行开启 CDP 远程调试端口。

社区来源：https://github.com/ScriptedAlchemy/grok-bot-cli 。社区 CLI 与本项目没有依赖或官方关联。

## 3. 手工联动或第三方 Agent

HachiOrb 托盘 → 复制 AI 状态接口地址（默认 `http://127.0.0.1:4173/api/state`，如被占用会改用 4174/4175）。

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/state' -Method Post -ContentType 'application/json' -Body '{"state":"working","agent":"custom","task":"任务进行中"}'
```

若端口不同，替换为托盘显示的真实端口。自带 Hook 自动尝试 4173、4174、4175。

## 4. 验收边界与安全说明

- 本地协议和安装器：已写自动测试；**Windows 真机、真实 Codex/Cursor/Grok Bot 账户的事件触发仍需你本机验收**。
- Cursor Hook 只在它支持的 Agent 事件下触发；不承诺读取普通编辑器光标、Tab 自动补全或云端 Bot 状态。
- Codex `notify` 只承诺 `agent-turn-complete`，不猜测任务是否失败；默认标记 `done` 仅表示一个 turn 已结束。
- Grok Bot 只提供主动发状态/包装器；**完整被动自动监控尚未支持**。
- Hook 不包含密钥，不发公网数据。localhost 端口只绑定到环回网卡。项目不主动开启云控制、CDP 调试或运行会话外部指令。
