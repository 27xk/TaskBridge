# TaskBridge

[![CI](https://github.com/27xk/TaskBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/27xk/TaskBridge/actions/workflows/ci.yml)
[![Android](https://img.shields.io/badge/android-APK-3DDC84)](https://github.com/27xk/TaskBridge/releases)
[![Windows](https://img.shields.io/badge/windows-installer-0078D4)](https://github.com/27xk/TaskBridge/releases)

TaskBridge 是一个登录后本地优先的跨端待办应用。首次使用需要连接一个 TaskBridge 服务器；登录并同步过后，手机、电脑和 Web 都能继续处理本机任务。Windows、Android 或 Web 的登录会话自然失效时，可以进入本机工作区继续处理缓存任务，重新登录后再同步。

它适合需要在多个设备之间切换工作的用户：在电脑上快速录入任务，在手机上接收提醒，在桌面小组件里扫一眼今天要做什么。

## 入口

先按这张表决定下一步，普通使用不需要阅读开发者说明。

| 你的情况 | 先做什么 | 入口 |
| --- | --- | --- |
| 我已经有服务器地址和账号 | 下载客户端或打开部署者提供的 Web/PWA 地址，然后登录 | [普通用户快速开始](./docs/user-quick-start.md) |
| 我还没有服务器地址 | 如果你只是使用别人部署好的 TaskBridge，请先向管理员或部署者索取服务器地址和账号 | 拿到地址后按“已有服务器地址”登录 |
| 我要维护或部署服务 | 本机试用先启动服务；长期使用先完成自托管部署 | [本机试用](./deploy/README.md#本机试用) / [自托管部署](./deploy/README.md) |

下载客户端：[GitHub Releases](https://github.com/27xk/TaskBridge/releases)。普通用户只安装名称中不带 `unsigned` 的已签名客户端；新版工作流不会再把 unsigned APK 或 EXE 上传到公开 Release。

## 普通用户快速开始

如果你已经拿到服务器地址和账号，普通使用不需要安装部署工具、不需要处理网络地址细节，也不需要阅读部署命令。只要打开客户端，填写服务器地址并登录。

### 已有服务器地址

如果管理员已经给你 TaskBridge 服务器地址和账号，直接按下面的路径开始：

1. 如果使用 Web/PWA，打开部署者提供的 TaskBridge 访问地址。
2. 如果使用桌面或手机客户端，打开 [Releases](https://github.com/27xk/TaskBridge/releases)，下载该版本提供的已签名 Windows 安装包或 Android APK；没有对应文件表示维护者尚未配置该平台签名，请先使用 Web/PWA。
3. 在登录页填写管理员或部署者给你的服务器地址。
4. 直接登录同一个账号。登录会自动检查连接；“检查连接”只用于排查服务器地址。

### 没有服务器地址

- **普通使用者：** 如果你只是使用别人部署好的 TaskBridge，请先向管理员或部署者索取服务器地址和账号。拿到地址后，回到上面的“已有服务器地址”路径登录。
- **本机试用：** 如果你要自己在这台电脑上体验同步流程，按[部署说明的本机试用](./deploy/README.md#本机试用)启动服务，再把说明里给出的服务器地址填到客户端。
- **长期自托管：** 如果你要维护长期使用、多人使用或公网访问的服务，按[部署说明](./deploy/README.md)完成生产配置，再把正式服务器地址填到客户端。

说明：

- 安装包可能带有默认服务器地址；如果登录页地址不对，请在登录页或设置页填写管理员给你的服务器地址。
- 下载后可用 Release 中的 `SHA256SUMS.txt` 核对文件；不要安装历史版本中名称带 `unsigned` 的文件。
- 桌面端安装后可以在「设置」里修改服务器地址。
- Android 端可以在登录 / 注册页的「连接设置」或设置页修改服务器地址。
- 桌面端和 Android 端都优先填写「服务器地址」；高级连接设置通常不需要修改。
- 使用 Release Compose 时，Web、Windows 和 Android 都填写统一入口 `http://<服务器>:8080`；端口 `8000` 只用于开发或高级 API 直连。
- 新建任务只需要先写标题；备注、清单、时间安排、标签和模板都可以按需展开。
- 手机或另一台电脑访问本机试用服务时，以部署说明里的客户端地址为准。
- 第一次离线使用前必须至少成功登录并同步一次。会话自然失效后，Web 显示“继续离线使用”，Windows 和 Android 显示“进入本机工作区”；联网后点“登录并同步”。主动退出仍会清除当前工作区身份。

普通使用不需要阅读开发者说明；登录、离线使用和同步状态处理都在客户端内完成。下面的开发者和自托管内容只适合维护、部署或排障时继续阅读。

## 你可以用它做什么

- 在电脑上记录工作任务，切到手机后继续查看。
- 登录并同步过后，可以在离线状态下新增、编辑和完成任务；Web 关闭会话后可继续使用本机缓存，重新登录后同步。
- 用今日视图区分逾期、待办和已完成任务。
- 通过 Android 小组件查看今天的任务。
- 用 Windows 悬浮窗常驻显示今日待办。
- 自建后端，数据保存在自己的服务器中。

## 功能

- **登录后的本地优先：** 首次完成登录后，没网时也能新增、编辑和完成任务；Web 支持从登录页重新打开本机缓存。
- **多端同步：** 有效登录会话恢复联网后会自动同步；Web 离线恢复模式需先重新登录。
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
