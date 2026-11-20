# HachiOrb Desktop v1.1（Windows 桌面 Grok Ball）

这是从 HachiWatch 项目分离出的 **Windows 桌面悬浮宠物**。不需要手表、手机、DevEco、华为账号或应用市场发布。

- **真正采用 TyCoding/grok-ball 的原版 SVG / JS 引擎**，不是临摹表情，也不是循环四张 PNG。
- 无边框、透明背景、球体始终可见。桌面任意角落拖动；短点球体旋转；全桌面鼠标注视。
- 系统托盘右键菜单：32 种表情、6 种 Agent 状态、球体尺寸、置顶、锁定鼠标穿透、隐藏/退出、打包后开机启动。
- 本机状态接口：接入 Codex / Claude Code / WorkBuddy / 其他 Hook，使用 `http://127.0.0.1:4173/api/state`。若端口被占用会选择 4174 或 4175，在托盘里可以查看、复制实际端口。
- 首次联网下载并校验上游源码，之后可以离线运行。

## 最简单的启动方法

**先在 Windows 电脑安装 Node.js 22+：** https://nodejs.org/

1. 解压 ZIP，进入 `HachiOrb-Desktop-v1` 目录。
2. **双击 `start-windows.bat`**。
3. 初次启动自动下载官方原版 Grok Ball 动画和 Electron。完成后，桌面右下角出现动态表情球。
4. **按住左键拖动球体**改变位置；轻点旋转；**右键球体**或右击 Windows 托盘中的 HachiOrb 图标打开设置。
5. 退出后再次双击同一个 BAT 即可启动；下载过的引擎和依赖可以离线复用。

> 说明：当前提供的是完整可构建源码，不是现成的已签名 Windows EXE。不能保证所有电脑网络都能下载 Electron。首次需要安装 Node.js；打包后便不需要 Node.js。

## 自己生成可直接双击运行的 EXE

在自己的 Windows 电脑上 **双击 `build-windows.bat`**。它会自动下载所需依赖并打包：

`release/HachiOrb-win32-x64/HachiOrb.exe`

需要把整个 `HachiOrb-win32-x64` 文件夹保留在一起。此 EXE 为未签名个人作品，Windows SmartScreen 可能提示未知发布者；请只运行自己构建的可信源码。

## 日常操作

| 操作 | 作用 |
|---|---|
| 单击球体 | 自旋并甩彩带 |
| 按住球体左键拖动 | 移动到桌面任意位置 |
| 移动鼠标 | 眼睛随桌面光标方向转动 |
| 右键球体 | 显示设置菜单 |
| 右键系统托盘 HachiOrb 图标 | 显示设置菜单，支持全部 32 种表情 |
| 双击托盘图标 | 恢复显示桌宠 |
| 菜单“始终置顶” | 关闭后允许其他窗口盖住球体 |
| 菜单“锁定球体（鼠标穿透）” | 不挡鼠标点击，**只能从托盘关闭锁定** |
| 菜单“开机启动” | 只对已打包的 exe 有效，默认不启用 |
| 菜单“退出 HachiOrb” | 完全退出，不再悬浮 |

## AI 状态联动（本地测试）

Windows PowerShell 在该文件夹中执行（应用运行期间）：

```powershell
.\examples\send-status.ps1 -State thinking -Task '正在分析估价报告' -Agent 'codex'
.\examples\send-status.ps1 -State working -Task '正在执行代码修改' -Agent 'codex'
.\examples\send-status.ps1 -State done -Task '任务已完成' -Agent 'codex'
```

也可在托盘中复制测试命令。API 接收以下 JSON（`progress` 可省略，不编造进度）：

```json
{"state":"thinking","task":"AI 正在思考","agent":"codex"}
```

状态映射：idle→02、thinking→30、working→32、done→33、error→34、sleep→00。也可以附带 `emotionId` 选择 32 个原版表情之一。API **仅监听本机 127.0.0.1**，不暴露到局域网。已提供 Codex/Cursor 的官方 Hook 适配文件与 Windows 安装器；Grok Bot 提供显式状态命令和可选社区 CLI 包装器（不承诺任意 GUI 活动的被动自动监控）。

## Codex、Cursor、Grok Bot 一键/手动接入

Windows 启动 HachiOrb 后，可先双击 `test-agent-connection-windows.bat` 检查本地接口，再双击 `setup-agent-hooks-windows.bat` 安装当前用户的 Codex、Cursor 和 WorkBuddy 状态 Hook。**新版安装器使用 Windows 自带 PowerShell，不要求另外安装 Node.js**。已有第三方 Codex notify 不会覆盖；Cursor 其他 Hook 保留并备份。WorkBuddy 使用 `%USERPROFILE%\.workbuddy\settings.json` 的本地 Hook（需要重启 WorkBuddy）；Grok Bot 的当前自动化边界和可选 CLI 包装详见 [INTEGRATIONS.md](INTEGRATIONS.md)。

## 开发和测试

```bash
node scripts/bootstrap.cjs    # 下载校验的原版动画，首次必需
npm install --no-audit --no-fund
npm start
npm test
```

`QuickPreview.html` 可不安装 Node 直接在浏览器中打开，但需要联网加载 Grok Ball 原版引擎；它只是预览，**不具备透明置顶和系统托盘**。

## 第三方协议与安全

上游：https://github.com/TyCoding/grok-ball

原始运行时固定于 Git 提交 `de368ce3acdc5a70e871ee46ebbe8f60b11d3d6a`，下载后校验 Git blob SHA-1 为 `9628dfce2cd35722dc472adde4defa24291b377f`；不匹配立即中止，避免执行未经验证脚本。源文件不在本包中提前伪造，运行启动脚本时会从上游获取。

Grok Ball 版权所有 (c) 2026 tycoding，MIT License 见 `third_party/LICENSE.grok-ball`。本项目仅提供适配层，不代表 xAI/Grok 官方产品。

Electron 作为运行容器，采用 `nodeIntegration:false`、`contextIsolation:true`、本地文件加载与 CSP。状态服务只绑定 localhost，外部网页不可跨域写入。请勿在任务文字中保存口令、API Key 或敏感个人信息。

## 验证边界

本次能在容器中运行 Node.js 自动测试和语法检查，但此环境无法下载 Windows Electron 二进制，也没有 Windows GUI。**“EXE 正常运行、置顶、透明、托盘、鼠标穿透”尚未在 Windows 真机验收**，应在你电脑上执行 `start-windows.bat` 验证。官方动画的浏览器效果可先在上游原版演示站或 `QuickPreview.html` 检查。

## 不想安装 Node.js？也可用 GitHub Actions 打包

源码里已经包含 `.github/workflows/windows-portable.yml`。将本项目完整上传到自己新建的 GitHub 仓库（根目录），打开 **Actions → Build HachiOrb Windows Portable → Run workflow**。打包成功后从 Actions 结果中下载 `HachiOrb-Windows-Portable`，解压里面的 ZIP，再双击 `HachiOrb.exe`。这条路线不需要在本机安装 Node.js，但需要 GitHub 仓库及可用的 Actions 额度，而且当前工作流尚未实际跑过。


> 代码仓库：`https://github.com/AshinTop/hachiorb-desktop`。


## v1.1.1 修复：拖动放大与 Agent Hook 安装

- 修复：拖动桌宠时使用固定的球体尺寸，结束拖动后校正窗口尺寸（包括不同 DPI 显示器之间移动）。
- 修复：拖动过程不再切换更大的阴影，避免视觉上突然变大。
- 修复：Windows Hook 安装器改用自带 PowerShell，无需 Node.js，并准确反馈安装成功/失败；不会覆盖已有第三方 notify。
- 新增：`test-agent-connection-windows.bat` 可直接检测与正在运行的 HachiOrb 的本地连接。
- 注意：以上是源码修改与静态/Node 测试，Windows 端的 PowerShell、Electron 真机交互需要最终验证。

### Windows 安装修复与复合通知器

- 拖动只改变位置；释放时校正窗口尺寸，拖动时阴影不再放大。
- 双击 `setup-agent-hooks-windows.bat`：优先 Node.js 复合通知器、无 Node 环境 PowerShell 等效方案；保留原 Codex `notify` 并先运行它，再调用桌宠。
- 已有配置将生成带时间戳的 `.hachiorb-backup-*` 备份。遇到复杂/无法安全解析的配置不会强行覆盖，须手动检查。
- Windows 便携版打包额外导出 BAT/安装脚本到与 `HachiOrb.exe` 同级的目录。
- Codex 完成事件只在任务轮次结束触发，不能实时显示所有思考/工作步骤。
