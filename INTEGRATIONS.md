# HachiOrb · Codex / Cursor / WorkBuddy / Grok Bot 集成

本项目只监听 `127.0.0.1`，本地状态事件由 Hook/CLI 在**你自己的电脑上**发送。
不上传聊天记录、API Key、完整 prompt、思维过程和输出内容。状态只有：`idle`、`thinking`、`working`、`done`、`error`、`sleep`，可选任务短标签。

## 1. 一键配置 Codex + Cursor（Windows）

先启动 HachiOrb，再双击仓库根目录的 `setup-agent-hooks-windows.bat`。
它只修改当前 Windows 用户：

- `%USERPROFILE%\.codex\config.toml`：若已有 `notify`，先备份并安全解析，再改为 **复合通知器**；原命令存入 `%LOCALAPPDATA%\HachiOrb\hooks\codex-original-notify.json`，触发时按顺序执行 **原通知 → HachiOrb**。已有复合通知器则不重复包装。
- `%USERPROFILE%\.cursor\hooks.json`：保留原来的其他 Hook，去重添加五种观察事件；修改前创建独立备份。

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

## 2. WorkBuddy 桌面版自动通知（新增）

现在支持 WorkBuddy Desktop 的本地 Hook。安装器将合并当前用户的
`%USERPROFILE%\.workbuddy\settings.json` 中的 `hooks`，备份为带 `.hachiorb-backup-...` 的文件。
不会读取或转发 prompt、工具参数、转录、会话数据库、原始回复内容；只发六态工作状态和简短固定标签。

| WorkBuddy Hook | HachiOrb 状态 |
| --- | --- |
| `SessionStart` | 待机 |
| `UserPromptSubmit` | 思考中 |
| `PreToolUse` / `PostToolUse` | 工作中 |
| `PermissionRequest` | 等待授权（Grok Ball 表情 `35`） |
| `Notification` 的 `permission_prompt` / `idle_prompt` | 等待输入（表情 `35`） |
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
Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/state' -Method Post -ContentType 'application/json' -Body '{"state":"working","agent":"custom","task":"任务进行中"}'
```

若端口不同，替换为托盘显示的真实端口。自带 Hook 自动尝试 4173、4174、4175。

## 5. 验收边界与安全说明

- 本地协议和安装器：已写自动测试；**Windows 真机、真实 Codex/Cursor/Grok Bot 账户的事件触发仍需你本机验收**。
- Cursor Hook 只在它支持的 Agent 事件下触发；不承诺读取普通编辑器光标、Tab 自动补全或云端 Bot 状态。
- Codex `notify` 只承诺 `agent-turn-complete`，不猜测任务是否失败；默认标记 `done` 仅表示一个 turn 已结束。
- Grok Bot 只提供主动发状态/包装器；**完整被动自动监控尚未支持**。
- Hook 不包含密钥，不发公网数据。localhost 端口只绑定到环回网卡。项目不主动开启云控制、CDP 调试或运行会话外部指令。

## Windows 便携版：无需安装 Node.js 的新 Hook 安装器

新版 `setup-agent-hooks-windows.bat` 使用 Windows 自带的 PowerShell 5.1+ 配置 Codex 和 Cursor，**不需要全局安装 Node.js**，也不需要启动 Codex 才能运行安装器。便携版 ZIP 中将附带此 BAT 和 PowerShell 脚本；请解压完整文件夹再运行。

- 先启动 `HachiOrb.exe`，右键托盘确认本地服务已启动。
- 双击 `test-agent-connection-windows.bat`，验证桌宠能收到模拟思考状态。
- 双击 `setup-agent-hooks-windows.bat`，查看两个独立的 `[OK]` / `[SKIP]` / `[ERROR]` 结果。
- 安装器将 Hook 处理程序复制到 `%LOCALAPPDATA%\HachiOrb\hooks\agent-status.ps1`，保证你之后移动解压文件夹时旧 Hook 不失效；配置文件在 `%USERPROFILE%\.codex\config.toml`、`%USERPROFILE%\.cursor\hooks.json`，修改前备份为 `*.hachiorb-backup-*`。
- 若 Codex 已有其他工具的 `notify`，**优先通过复合通知器保留原命令并同时通知 HachiOrb**，不再要求常规情况下手工合并。若配置包含不支持的复杂语法、递归包装、缺失原始记录等不安全情况，则输出 `[ERROR]` 并保留原配置，要求人工核查。
- Codex 官方 `notify` 只在 `agent-turn-complete` 触发，且是否会从你当前使用的 **Codex GUI/IDE** 触发取决于其运行方式，不保证所有 Codex 界面都使用 CLI 配置。<https://learn.chatgpt.com/docs/config-file/config-advanced>
- Cursor 用户级 Hooks 只在本机支持的 Agent 会话中运行；普通补全、远程云 Agent 不等同于本机 Hook。<https://cursor.com/docs/hooks>
- 如果 PowerShell 执行被公司策略限制，安装器会显示错误；不要全局降低系统安全策略，可让管理员审核此安装脚本。

新版 BAT **优先使用 Node.js** 执行 `scripts/setup-integrations.cjs`，将 `notify` 指向 `codex-notify-dispatcher.cjs`；若 Windows 没有 Node.js，则运行 `scripts/setup-agent-hooks.ps1`，安装等效的 `codex-notify-dispatcher.ps1`。两种安装方式共用原始通知命令记录，重复运行不会层层嵌套。

复合通知器接收 Codex 提供的**同一份 JSON 命令行参数**，先执行原程序、再执行 HachiOrb 的本地通知。原程序失败不会阻止桌宠接收事件，原程序和项目源码均不需要修改。原始通知命令只保存在本机用户配置目录。复合通知器不会将完整提示词或模型回复发送给 HachiOrb；只发送任务状态。

Windows Release 便携版已经增加外置 BAT、PowerShell 和 Node.js 安装器的打包步骤，解压后安装入口将位于 `HachiOrb.exe` **同一目录**。

**限制：** 官方 Codex `notify` 目前只提供 `agent-turn-complete`，不是实时思考/工具调用事件。Codex GUI/IDE 是否读取当前用户的 CLI notify 还需本机验证。

**源文件：** `scripts/setup-integrations.cjs`、`scripts/codex-notify-config.cjs`、`integrations/codex-notify-dispatcher.cjs`、`integrations/codex-notify-dispatcher.ps1`。
