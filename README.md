# HachiOrb Desktop v1.3.1

HachiOrb 是 Windows 桌面悬浮宠物，也可以显示 Codex、Cursor、WorkBuddy 和 Grok Bot 上报的状态。动画采用 [TyCoding/grok-ball](https://github.com/TyCoding/grok-ball) 原版 SVG / JavaScript 引擎。

- Windows x64 便携版：无需安装向导，解压后运行 `HachiOrb.exe`。
- 可通过 Hook 事件显示思考、执行、等待授权、完成和错误等状态。
- 支持多种 AI 工具同时上报；当前按工具记录最近状态，不区分同一工具中的多个并行对话。
- 状态服务只监听本机 `127.0.0.1`，默认端口 `4173`；端口被占用时会尝试 `4174`、`4175`。
- Hook 只上报状态类型和固定短标签，不读取或上传提示词、聊天正文、代码、工具参数或密钥。

## 下载和安装

前往 [GitHub Releases](https://github.com/AshinTop/hachiorb-desktop/releases/latest)，下载 `HachiOrb-1.3.1-win32-x64.zip`。

1. 将 ZIP **完整解压**到固定文件夹，例如 `C:\Apps\HachiOrb`。不要直接在压缩包中运行，也不要只复制 `HachiOrb.exe`；程序依赖文件必须与 EXE 放在一起。
2. 双击解压目录中的 `HachiOrb.exe`。首次启动后，桌面上会出现小球，系统托盘也会显示 HachiOrb 图标。
3. 右键小球或托盘图标打开菜单；拖动小球可以调整位置，托盘菜单可以设置表情、尺寸、置顶和鼠标穿透。

这是未经代码签名的个人构建版，Windows SmartScreen 可能显示未知发布者。请从本项目 Release 下载，并可用同一页面提供的 `.sha256` 文件核对 ZIP 完整性。

## 接入 Codex、Cursor 和 WorkBuddy

若要显示 AI 工具的 Hook 状态，需要在运行 HachiOrb 的同一台电脑上安装 **Node.js 22 或更新版本**。运行桌宠本身不需要另外安装 Node.js。

1. 确认 HachiOrb 正在运行。
2. 在解压目录双击 `setup-agent-hooks-windows.bat`。请使用与 Codex、Cursor、WorkBuddy 相同的 Windows 用户账户运行。
3. 安装完成后，完全退出并重启 Codex、Cursor 和 WorkBuddy，再提交一条真实任务验证状态变化。

安装器会配置 Codex 生命周期 Hook、Cursor Hook，并将 HachiOrb 本地 Hook 插件注册到 WorkBuddy Desktop。已有 Codex `notify` 和其他 Hook 会保留；修改配置前会生成 `.hachiorb-backup-*` 备份。配置复杂或格式不支持时，安装器会报告错误并避免强行覆盖。WorkBuddy 必须完全退出后重启，才能加载新插件。

没有 Node.js 时，安装器的 PowerShell 后备方案可以配置 Codex 和 Cursor，但 WorkBuddy Hook 需要 Node.js。为了一次装好三种工具，请先安装 Node.js 22+，再运行安装器。

可双击 `test-agent-connection-windows.bat` 检查 HachiOrb 的本地状态接口是否可连接。它只检查本地接口，不代表 AI 工具的 Hook 已经触发。

## 状态和隐私说明

状态来自 AI 工具实际触发的 Hook 事件，并通过 `http://127.0.0.1:4173/api/state` 送到本机正在运行的 HachiOrb。历史事件不会回放；如果 Hook 触发时 HachiOrb 没有运行，小球不会收到那条状态。托盘菜单可查看各工具最近一次上报状态，以及当前监听端口。

Codex 的状态由它提供的生命周期 Hook 触发，不代表读取模型内部思维过程。WorkBuddy 通过本地插件 Hook 接入。当前状态按工具维度汇总，因此同一个工具的多个并行对话不会分别显示。HachiOrb 不会自动批准权限请求，也不把状态内容发送到互联网。

## 常见问题

- **小球没出现：** 确认 `HachiOrb.exe` 仍在运行；也可以在系统托盘中查找 HachiOrb 图标并选择显示桌宠。
- **AI 工作了但小球没变化：** 确认 HachiOrb 已运行，再运行一次安装器，完整退出并重启对应 AI 工具，然后用新的真实任务测试。检查安装器输出是否有错误。
- **WorkBuddy 一直待机：** 确认安装器提示 WorkBuddy 插件已配置；检查 `node --version` 是否为 22 或更新版本；完全退出 WorkBuddy（包括托盘进程）后重启。
- **连接测试通过但没有状态：** 连接测试只验证本地接口。还需要确认相应 AI 工具实际触发 Hook，并在 Hook 触发时保持 HachiOrb 运行。
- **安装器提示配置格式不支持：** 它会保留原配置不变。查看同目录生成的备份，并根据错误提示手动合并后再重试。

## 更新

1. 退出 HachiOrb。
2. 下载新版 ZIP 并完整解压到新的文件夹，保留文件夹内全部文件。
3. 运行新版 `HachiOrb.exe`。如果新版包含 Hook 修复，再运行 `setup-agent-hooks-windows.bat` 并重启对应 AI 工具。

## 从源码构建

需要 Windows x64、Node.js 22+ 和网络连接：

```powershell
npm ci
npm run fetch:engine
npm test
npm run pack:win
```

便携构建目录为 `release/HachiOrb-win32-x64`，可执行文件为 `HachiOrb.exe`。发布时需将整个目录打成 ZIP。

## v1.3.1 更新内容

- 自动注册 WorkBuddy Desktop 的本地 HachiOrb Hook 插件，减少手动配置步骤。
- 修复便携包缺少 Hook 安装脚本版本信息的问题。
- 保持拖动小球时尺寸稳定。
- 补充 Codex、Cursor、WorkBuddy 的安装、重启和排障说明。

## 第三方项目和许可

动画引擎来自 [TyCoding/grok-ball](https://github.com/TyCoding/grok-ball)，许可证见仓库中的 `third_party/LICENSE.grok-ball`。HachiOrb 是社区项目，不代表 xAI、OpenAI、Cursor 或 WorkBuddy 官方产品。
