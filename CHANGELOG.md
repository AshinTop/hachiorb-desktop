# HachiOrb Desktop · 版本更新记录

该文件记录源码功能更新和修复。GitHub Release/Windows EXE 是否生成、签名和真机验收，请以各 Release 页面为准。

## v1.4.0 — Grok Ball Pro 多球体切换

- 动画引擎更新为 AshinTop/grok-ball-pro 的指定版本 308db672，下载后校验 Git blob SHA-1；沿用现有透明悬浮窗、拖动修复与 AI Hook。
- 支持 9 款 Pro 球体：经典白球、经典黑球、阿信粉球、怪兽红球、玛莎黄球、石头绿球、冠佑眼镜蓝球、蓝色梦想倔强卜卜、胡萝卜卜卜。
- 右键/托盘可切球，保存选择并在重启后恢复；只调用引擎 setBody()，不重置原有表情与 AI Agent 状态。
- 扩展到 42 种表情，新增 Pro 专属表情菜单和 22–25、42–47 的状态映射。
- 预览页更新为 Pro 引擎，多球体自由切换；版本记录从 README 迁移到 CHANGELOG。
- 增加球体清单、持久化设置、引擎校验与 42 种表情回归检查。

## v1.3.1 — WorkBuddy 兼容与安装

- WorkBuddy Desktop 本地 Hook 插件自动注册，改进便携包安装脚本与拖动尺寸稳定性。
- 补充 Codex、Cursor、WorkBuddy 安装说明与故障排查。

## v1.3.0 — 多 Agent 状态

- Codex、Cursor、WorkBuddy 和 Grok Bot 的已上报状态分开记录，显示当前需关注的 Agent。
- WorkBuddy 等待授权/输入优先提醒，陈旧状态按过期时间处理；新增可关闭的小型状态标签。

## v1.2.0 — 拖动与通知器

- 修复拖动过程中的尺寸、阴影变化，支持 Codex 复合通知器与配置备份。
- 加入 PowerShell 后备安装、本机接口测试和 WorkBuddy 事件 Hook。

## v1.1.0 — 首版 Windows 桌宠

- Electron 透明无边框桌宠、托盘菜单、原始 Grok Ball 32 表情、鼠标注视及基础 Agent 本机状态接口。
