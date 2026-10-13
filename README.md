# TaskBridge

[![CI](https://github.com/27xk/TaskBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/27xk/TaskBridge/actions/workflows/ci.yml)
[![Android](https://img.shields.io/badge/android-APK-3DDC84)](https://github.com/27xk/TaskBridge/releases)
[![Windows](https://img.shields.io/badge/windows-installer-0078D4)](https://github.com/27xk/TaskBridge/releases)

TaskBridge 是一个登录后本地优先的跨端待办应用。首次使用需要连接一个 TaskBridge 服务器；登录并同步过后，手机、电脑和 Web 都能继续处理本机任务。同源 Web/PWA 正常关闭浏览器后会自动恢复登录；Windows、Android 或 Web 的登录会话失效时，也可以进入本机工作区继续处理缓存任务，重新登录后再同步。

它适合需要在多个设备之间切换工作的用户：在电脑上快速录入任务，在手机上接收提醒，在桌面小组件里扫一眼今天要做什么。

## 入口

先按这张表决定下一步，普通使用不需要阅读开发者说明。

| 你的情况 | 先做什么 | 入口 |
| --- | --- | --- |
| 我已有账号和对应客户端 | 打开部署者提供的 Web/PWA，或安装对应的 Windows / Android 发布包后直接登录 | [普通用户快速开始](./docs/user-quick-start.md) |
| 我还没有服务入口 | 向管理员索取 Web 访问地址或已配置的客户端安装包，以及账号 | 拿到入口后直接登录 |
| 我要维护或部署服务 | 本机试用先启动服务；长期使用先完成自托管部署 | [本机试用](./deploy/README.md#本机试用) / [自托管部署](./deploy/README.md) |

下载客户端：[GitHub Releases](https://github.com/27xk/TaskBridge/releases)。普通用户只安装名称中不带 `unsigned` 的已签名客户端；新版工作流不会再把 unsigned APK 或 EXE 上传到公开 Release。

## 普通用户快速开始

普通使用不需要配置服务器地址。Web 使用部署者提供的访问地址；Windows 和 Android 发布包在构建时写入服务地址。打开对应客户端后直接登录。

### 已有服务入口

如果管理员已经给你 TaskBridge 入口和账号，直接按下面的路径开始：

1. 如果使用 Web/PWA，打开部署者提供的 TaskBridge 访问地址。
2. 如果使用桌面或手机客户端，打开 [Releases](https://github.com/27xk/TaskBridge/releases)，下载该版本提供的已签名 Windows 安装包或 Android APK；没有对应文件表示维护者尚未配置该平台签名，请先使用 Web/PWA。
3. 在登录页输入账号和密码。连接失败时检查网络；持续失败请联系管理员确认部署状态和安装包版本。

### 没有服务入口

- **普通使用者：** 向管理员索取 Web 访问地址或对应服务的已配置客户端，以及账号。
- **本机试用：** 按[部署说明的本机试用](./deploy/README.md#本机试用)启动服务，再打开本机 Web 入口。开发构建可按开发文档配置测试地址。
- **长期自托管：** 按[部署说明](./deploy/README.md)完成生产配置，并在发布客户端时注入对应服务地址。

说明：

- Windows 和 Android 发布包固定使用构建时写入的服务地址；地址变更时需要管理员重新发布客户端。
- 下载后可用 Release 中的 `SHA256SUMS.txt` 核对文件；不要安装历史版本中名称带 `unsigned` 的文件。
- 使用 Release Compose 时，发布配置应指向统一入口 `http://<服务器>:8080`；端口 `8000` 只用于开发或 API 直连。
- 新建任务只需要先写标题；备注、清单、时间安排、标签和模板都可以按需展开。
- Windows、Web 和 Android 都可以进入选择模式，批量完成或删除当前列表中的任务；回收站中的恢复和永久删除仍单独确认。
- 手机或另一台电脑访问本机试用服务时，以部署说明里的客户端地址为准。
- 第一次离线使用前必须至少成功登录并同步一次。Web/PWA 关闭浏览器后通常会自动恢复登录。会话失效后，Web 显示“继续离线使用”，Windows 和 Android 显示“进入本机工作区”，联网后点“登录并同步”。主动退出会尝试撤销当前会话并清除工作区身份；如果服务器未确认撤销，客户端会明确提示。
- Web、Windows 和 Android 登录页都会说明忘记密码后的处理方式：请联系服务器管理员重置。

普通使用不需要阅读开发者说明；登录、离线使用和同步状态处理都在客户端内完成。下面的开发者和自托管内容只适合维护、部署或排障时继续阅读。

## 你可以用它做什么

- 在电脑上记录工作任务，切到手机后继续查看。
- 登录并同步过后，可以在离线状态下新增、编辑和完成任务；Web/PWA 关闭浏览器后会自动恢复登录，会话失效时仍可继续使用本机缓存，重新登录后同步。
- 用今日视图区分逾期、待办和已完成任务。
- 通过 Android 小组件查看今天的任务。
- 用 Windows 悬浮窗常驻显示今日待办。
- 自建后端，数据保存在自己的服务器中。

## 功能

- **登录后的本地优先：** 首次完成登录后，没网时也能新增、编辑和完成任务；Web 支持从登录页重新打开本机缓存。
- **多端同步：** 有效登录会话恢复联网后会自动同步；Web 会在浏览器重开后恢复有效会话，只有显式离线恢复模式需要先重新登录。
- **冲突处理：** 多台设备同时改同一条任务时，客户端会提示用户选择保留哪一份。
- **今日待办：** 支持计划日期、截止时间、逾期判断、已完成排序和今日视图。
- **Android 小组件：** 支持清晰黑字和带深色遮罩的透明白字样式；任务超出显示容量时会提示打开应用查看全部。
- **Windows 桌面端：** 提供主窗口、系统托盘、悬浮窗、全局快捷键、本地提醒和可持久化的桌面端主题。
- **自托管：** 可以把服务部署在自己的电脑、NAS 或服务器上。

## 开发者和自托管说明

普通使用不需要阅读开发者说明；从这里开始的内容面向维护、部署、开发和排障。

### 维护者入口

- **Demo 演示：** [演示脚本](./docs/demo.md)
- **一键部署：** [部署说明](./deploy/README.md)
- **开发启动与验证：** [开发说明](./docs/development.md)
- **常见问题与排障：** [常见问题](./docs/troubleshooting.md)
- **发布与镜像：** [GitHub 发布说明](./docs/github-release.md)
- **容器镜像：** [GHCR / Docker Hub](https://github.com/27xk/TaskBridge/pkgs/container/taskbridge)
- **路线图：** [Roadmap](./ROADMAP.md)
- **参与贡献：** [CONTRIBUTING.md](./CONTRIBUTING.md)

开发启动、技术栈、Web/PWA 本地访问、CORS 示例和完整验证命令已经移到 [开发说明](./docs/development.md)。README 只保留入口，避免普通用户在登录前被部署命令打断。

## Keywords

TaskBridge, todo app, task manager, offline-first, cross-platform sync, Android task app, Windows task app, Electron desktop app, FastAPI backend, self-hosted productivity app, WebSocket sync, Docker deployment, Docker Hub, GHCR.

## 文档

- [跨端工作区与同步可靠性更新](./docs/release-notes/2026-10-13-cross-platform-workspace.md)：本轮功能介绍、部署变化与验证范围。

- [后端说明](./backend/README.md)
- [Android 构建说明](./android/README.md)
- [桌面端说明](./desktop/README.md)
- [开发说明](./docs/development.md)
- [架构说明](./docs/architecture.md)
- [API 设计](./docs/api-design.md)
- [同步设计](./docs/sync-design.md)
- [Demo 演示脚本](./docs/demo.md)
- [部署说明](./deploy/README.md)
- [发布说明](./docs/github-release.md)
- [安全说明](./docs/security.md)
- [常见问题](./docs/troubleshooting.md)
- [开发路线图](./docs/development-roadmap.md)
