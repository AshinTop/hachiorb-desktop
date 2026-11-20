# HachiOrb · Codex / Cursor / WorkBuddy / Grok Bot 集成（v1.3.0）

本项目只监听 `127.0.0.1`，本地状态事件由 Hook/CLI 在**你自己的电脑上**发送。
不上传聊天记录、API Key、完整 prompt、思维过程和输出内容。状态只有：`idle`、`thinking`、`working`、`done`、`error`、`sleep`，可选任务短标签。

## 1. 一键配置 Codex + Cursor（Windows）

先启动 HachiOrb，再双击仓库根目录的 `setup-agent-hooks-windows.bat`。
它只修改当前 Windows 用户：

- `%USERPROFILE%\.codex\config.toml`：若已有 `notify`，先备份并安全解析，再改为 **复合通知器**；原命令存入 `%LOCALAPPDATA%\HachiOrb\hooks\codex-original-notify.json`，触发时按顺序执行 **原通知 → HachiOrb**。已有复合通知器则不重复包装。
- `%USERPROFILE%\.codex\hooks.json`（或 `%CODEX_HOME%\hooks.json`）：合并 Codex 生命周期 Hook，保留其他 Hook，并在修改前备份。提示词、工具参数和回复内容不会转发给 HachiOrb。
- `%USERPROFILE%\.cursor\hooks.json`：保留原来的其他 Hook，去重添加五种观察事件；修改前创建独立备份。

配置后重启/重开相关 Codex、Cursor Agent 会话，进行一次测试。不会自动向其他项目提交代码。关闭 HachiOrb 后 Hook 会快速跳过，不会向远程服务器发送状态。

### Codex

`notify` 仍仅在 `agent-turn-complete` 时触发；实时状态由 Codex 官方生命周期 Hook 提供：提交提示词时显示思考中，调用工具或子代理时显示处理中，等待授权时显示提醒，回合结束或中断时更新状态。Hook 只根据固定事件名发送状态，不读取或转发 Hook JSON 中的提示词和工具内容。

Codex 会要求你审核并信任新 Hook 后才运行。在 Codex 桌面端打开 **Settings > Hooks**（或选择 **Review hooks**）审核 HachiOrb Hook；CLI 可用 `/hooks`。安装器不会替你自动信任。官方说明：[Codex Hooks](https://learn.chatgpt.com/docs/hooks)。

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

## 2. WorkBuddy 桌面版自动通知（新增）

现在支持 WorkBuddy Desktop 的本地 Hook。安装器将合并当前用户的
`%USERPROFILE%\.workbuddy\settings.json` 中的 `hooks`，备份为带 `.hachiorb-backup-...` 的文件。
不会读取或转发 prompt、工具参数、转录、会话数据库、原始回复内容；只发六态工作状态和简短固定标签。

| WorkBuddy Hook | HachiOrb 状态 |
| --- | --- |
| `SessionStart` | 待机 |
| `UserPromptSubmit` | 思考中 |
| `PreToolUse` / `PostToolUse` | 工作中 |
| `PermissionRequest` | **等待授权**（Grok Ball 表情 `35`，`attention=permission`） |
| `Notification.permission_prompt` | **等待授权**（表情 `35`） |
| `Notification.idle_prompt` | **等待回答**（表情 `35`，`attention=input`） |
| `Stop` | 本轮结束，完成庆祝（不代表所有后台任务均结束） |
| `SessionEnd` | 待机 |

先运行 HachiOrb，再双击 `setup-agent-hooks-windows.bat`，随后**完全退出 WorkBuddy 后重新打开**并创建实际任务。
WorkBuddy 桌面端 Hook 行为来自社区实测，官方 CodeBuddy Code 文档的全部事件并不保证在所有 WorkBuddy Desktop 版本都生效。
检测失败时请检查 WorkBuddy 版本、是否打开了工作区，以及该用户的 settings.json 是否加载。
原有其他 Hook 不会被删除。安装器不请求 WorkBuddy 账号、令牌或云端接口权限。

实测参考：https://cloud.tencent.cn/developer/article/2713175

## 3. Grok Bot

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

## 4. 手工联动或第三方 Agent

HachiOrb 托盘 → 复制 AI 状态接口地址（默认 `http://127.0.0.1:4173/api/state`，如被占用会改用 4174/4175）。

```powershell
.\examples\send-status.ps1 -Port 4173 -State working -Agent custom -Task '任务进行中'
```

若端口不同，替换为托盘显示的真实端口。自带 Hook 自动尝试 4173、4174、4175。

## 5. 验收边界与安全说明

- 本地协议和安装器：已写自动测试；**Windows 真机、真实 Codex/Cursor/Grok Bot 账户的事件触发仍需你本机验收**。
- Cursor Hook 只在它支持的 Agent 事件下触发；不承诺读取普通编辑器光标、Tab 自动补全或云端 Bot 状态。
- Codex 的 `notify` 只承诺 `agent-turn-complete`；实时状态使用生命周期 Hook。Hook 定义变更后需在 Codex 中重新审核/信任。
- Grok Bot 只提供主动发状态/包装器；**完整被动自动监控尚未支持**。
- Hook 不包含密钥，不发公网数据。localhost 端口只绑定到环回网卡。项目不主动开启云控制、CDP 调试或运行会话外部指令。

## Windows 便携版：无需安装 Node.js 的新 Hook 安装器

新版 `setup-agent-hooks-windows.bat` 使用 Windows 自带的 PowerShell 5.1+ 配置 Codex 和 Cursor，**不需要全局安装 Node.js**，也不需要启动 Codex 才能运行安装器。便携版 ZIP 中将附带此 BAT 和 PowerShell 脚本；请解压完整文件夹再运行。

- 先启动 `HachiOrb.exe`，右键托盘确认本地服务已启动。
- 双击 `test-agent-connection-windows.bat`，验证桌宠能收到模拟思考状态。
- 双击 `setup-agent-hooks-windows.bat`，查看两个独立的 `[OK]` / `[SKIP]` / `[ERROR]` 结果。
- 安装器将 Hook 处理程序复制到 `%LOCALAPPDATA%\HachiOrb\hooks\`，保证你之后移动解压文件夹时旧 Hook 不失效；配置文件在 Codex 用户目录（优先 `%CODEX_HOME%`，否则 `%USERPROFILE%\.codex`）和 `%USERPROFILE%\.cursor\hooks.json`，修改前备份为 `*.hachiorb-backup-*`。
- 若 Codex 已有其他工具的 `notify`，**优先通过复合通知器保留原命令并同时通知 HachiOrb**，不再要求常规情况下手工合并。若配置包含不支持的复杂语法、递归包装、缺失原始记录等不安全情况，则输出 `[ERROR]` 并保留原配置，要求人工核查。
- Codex 官方生命周期 Hook 当前可用于本地 Codex 会话；需要在 Codex 中审核/信任新 Hook 后生效。若 `config.toml` 显式关闭 Hooks 或已使用内联 `[hooks]` 配置，安装器会保留配置并提示人工合并。<https://learn.chatgpt.com/docs/hooks>
- Cursor 用户级 Hooks 只在本机支持的 Agent 会话中运行；普通补全、远程云 Agent 不等同于本机 Hook。<https://cursor.com/docs/hooks>
- 如果 PowerShell 执行被公司策略限制，安装器会显示错误；不要全局降低系统安全策略，可让管理员审核此安装脚本。

新版 BAT **优先使用 Node.js** 执行 `scripts/setup-integrations.cjs`，将 `notify` 指向 `codex-notify-dispatcher.cjs`；若 Windows 没有 Node.js，则运行 `scripts/setup-agent-hooks.ps1`，安装等效的 `codex-notify-dispatcher.ps1`。两种安装方式共用原始通知命令记录，重复运行不会层层嵌套。

复合通知器接收 Codex 提供的**同一份 JSON 命令行参数**，先执行原程序、再执行 HachiOrb 的本地通知。原程序失败不会阻止桌宠接收事件，原程序和项目源码均不需要修改。原始通知命令只保存在本机用户配置目录。复合通知器不会将完整提示词或模型回复发送给 HachiOrb；只发送任务状态。

Windows Release 便携版已经增加外置 BAT、PowerShell 和 Node.js 安装器的打包步骤，解压后安装入口将位于 `HachiOrb.exe` **同一目录**。

**限制：** Codex 只会运行已审核并信任的 Hook。Hook 事件覆盖 Codex 根会话与子代理，但 HachiOrb 的聚合状态按产品区分，不区分同一产品内的多个并行会话。

**源文件：** `scripts/setup-integrations.cjs`、`scripts/codex-notify-config.cjs`、`integrations/codex-hook.cjs`、`integrations/agent-status.ps1`、`integrations/codex-notify-dispatcher.cjs`、`integrations/codex-notify-dispatcher.ps1`。

## 6. 多 Agent 状态仲裁（v1.3.0）

本地 `POST /api/state` 兼容原有格式。新增可选 `attention`：只接受 `permission`、`input`，且必须配合 `state: "idle"`；工作区名称和提示词不用于选择优先级。系统按 Agent 维护最近一次事件（上限 16 个 Agent 标识），**不会因为其他工具的 `idle` / `done` 事件把正在工作中的 Agent 错误切成待机**。

- 最高优先级是最近 10 分钟内的等待授权/等待回答。触发权限请求时仍由 WorkBuddy 客户端决定，HachiOrb 只显示提醒。
- 之后是手动表情预览（约 8 秒）、最近错误、思考/工作中的任务、本轮完成、待机/休息；高优先级选择过期后自动恢复到下一个有新事件的 Agent。
- 当前标签只显示「**Agent 名称 · 状态**」，状态文字不会带 prompt / 工具输出；右键托盘可关闭标签，仍能查看各 Agent 最近状态。
- `GET /api/state` 返回当前选中的状态及 `agents` 数组，含 `agent/state/attention/emotionId/reportedAt/stale`。`stale` 表示旧事件已过展示有效期，不代表进程断线。**同产品多会话暂时不能分别追踪**。
- Grok Bot 仍依赖显式上报或已验证的第三方 CLI 包装器，未声称具备官方通用任务事件 Hook。

例如在 Windows PowerShell 中模拟 WorkBuddy 等待用户回答：

```powershell
.\examples\send-status.ps1 -Port 4173 -Agent workbuddy -State idle -EmotionId 35 -Attention input -Task 'WorkBuddy 等待回答'
```

若端口被占用，以托盘显示的实际端口为准。
