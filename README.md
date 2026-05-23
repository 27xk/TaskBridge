# TaskBridge

[![CI](https://github.com/27xk/TaskBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/27xk/TaskBridge/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/docker-GHCR%20%2B%20Docker%20Hub-2496ED)](https://github.com/27xk/TaskBridge/pkgs/container/taskbridge)
[![Android](https://img.shields.io/badge/android-APK-3DDC84)](https://github.com/27xk/TaskBridge/releases)
[![Windows](https://img.shields.io/badge/windows-installer-0078D4)](https://github.com/27xk/TaskBridge/releases)

TaskBridge 是一个本地优先的跨端待办应用。手机、电脑和桌面小组件都能离线使用；网络恢复后，任务会自动同步到其他设备。

它适合需要在多个设备之间切换工作的用户：在电脑上快速录入任务，在手机上接收提醒，在桌面小组件里扫一眼今天要做什么。

## 入口

- **下载：** [GitHub Releases](https://github.com/27xk/TaskBridge/releases)
- **Demo 演示：** [演示脚本](./docs/demo.md)
- **一键部署：** [部署说明](./deploy/README.md)
- **发布与镜像：** [GitHub 发布说明](./docs/github-release.md)
- **路线图：** [Roadmap](./ROADMAP.md)
- **参与贡献：** [CONTRIBUTING.md](./CONTRIBUTING.md)

## 截图

### Windows 桌面端

<p align="center">
  <img src="./docs/assets/screenshots/PC的今日.png" alt="Windows 桌面端今日待办" width="860">
</p>

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./docs/assets/screenshots/PC的全部.png" alt="Windows 桌面端全部任务" width="100%">
      <br>
      <sub>全部任务</sub>
    </td>
    <td align="center" width="50%">
      <img src="./docs/assets/screenshots/PC的设置.png" alt="Windows 桌面端设置页" width="100%">
      <br>
      <sub>基础设置</sub>
    </td>
  </tr>
</table>

### Android App

<p align="center">
  <img src="./docs/assets/screenshots/APP首页.jpg" alt="Android App 首页" width="260">
  &nbsp;&nbsp;
  <img src="./docs/assets/screenshots/APP设置页.jpg" alt="Android App 设置页" width="260">
</p>

### 桌面小组件与悬浮窗

<table>
  <tr>
    <td align="center" width="58%">
      <img src="./docs/assets/screenshots/APP两组件UI.jpg" alt="Android 两套小组件样式" width="100%">
      <br>
      <sub>Android 小组件</sub>
    </td>
    <td align="center" width="42%">
      <img src="./docs/assets/screenshots/PC悬浮窗.png" alt="Windows 桌面悬浮窗" width="280">
      <br>
      <sub>Windows 悬浮窗</sub>
    </td>
  </tr>
</table>

## 你可以用它做什么

- 在电脑上记录工作任务，切到手机后继续查看。
- 在离线状态下新增、编辑、完成任务，稍后自动同步。
- 用今日视图区分逾期、待办和已完成任务。
- 通过 Android 小组件查看今天的任务。
- 用 Windows 悬浮窗常驻显示今日待办。
- 自建后端，数据保存在自己的 MySQL 和 Redis 中。

## 功能

- **本地优先：** Android 使用 Room，Windows 使用 SQLite。
- **多端同步：** 客户端通过同步队列上传离线变更，通过增量接口拉取云端变更。
- **冲突处理：** 服务端使用 `version` 做乐观锁，客户端可保留冲突状态并由用户处理。
- **今日待办：** 支持计划日期、截止时间、逾期判断、已完成排序和今日视图。
- **Android 小组件：** 支持清晰黑字和透明白字两套样式。
- **Windows 桌面端：** 提供主窗口、系统托盘、悬浮窗、全局快捷键和本地提醒。
- **后端服务：** FastAPI、MySQL、Redis、JWT、Alembic、WebSocket 和自动化测试。

## 快速安装

### 普通用户

1. 打开 [Releases](https://github.com/27xk/TaskBridge/releases)。
2. 下载 Windows 安装包或 Android APK。
3. 启动后端服务，或连接到你已经部署好的 TaskBridge API。
4. 在 App / 桌面端中登录同一个账号。

说明：

- Android APK 和 Windows 安装包会使用构建时写入的默认后端地址。
- 桌面端仍可在「设置」里修改 API 地址和 WebSocket 地址。
- Android 端修改后端地址需要重新构建 APK。

### 自托管后端

复制以下命令即可启动后端、MySQL 和 Redis：

```bash
git clone https://github.com/27xk/TaskBridge.git
cd TaskBridge/deploy
cp .env.example .env
docker compose -f docker-compose.release.yml up -d
```

默认 API 地址：

```text
http://127.0.0.1:8000
```

如果要让手机或其他电脑访问，请把客户端后端地址改成服务器的局域网 IP 或域名，例如：

```text
http://192.168.1.10:8000/api/v1/
ws://192.168.1.10:8000/ws/sync
```

## 开发启动

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Android

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

连接本机模拟器后端：

```powershell
.\gradlew.bat :app:assembleDebug `
  -PTASKBRIDGE_BASE_URL=http://10.0.2.2:8000/api/v1/ `
  -PTASKBRIDGE_WS_URL=ws://10.0.2.2:8000/ws/sync
```

### Windows 桌面端

```powershell
cd desktop
npm ci
npm run dev
```

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 后端 | Python 3.11、FastAPI、SQLAlchemy 2.x、Alembic、MySQL、Redis、JWT、Docker |
| Android | Kotlin、Jetpack Compose、Room、Retrofit、OkHttp WebSocket、WorkManager、DataStore、AppWidget |
| Windows 桌面端 | Electron、Vue 3、TypeScript、Pinia、SQLite、electron-store、electron-builder |
| 同步 | HTTP 增量同步、同步队列、WebSocket 通知、任务版本控制、软删除 |

## 常用验证命令

```powershell
# 后端
cd backend
python -m pytest tests -q
python -m compileall -q app tests

# Android
cd android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat :app:assembleDebug

# 桌面端
cd desktop
npm run check:security-config
npm run check:desktop-endpoint-config
npm run typecheck
npm run build
```

## Keywords

TaskBridge, todo app, task manager, offline-first, cross-platform sync, Android task app, Windows task app, Electron desktop app, FastAPI backend, self-hosted productivity app, WebSocket sync, Docker deployment, Docker Hub, GHCR.

## 文档

- [后端说明](./backend/README.md)
- [Android 构建说明](./android/README.md)
- [桌面端说明](./desktop/README.md)
- [架构说明](./docs/architecture.md)
- [API 设计](./docs/api-design.md)
- [同步设计](./docs/sync-design.md)
- [Demo 演示脚本](./docs/demo.md)
- [部署说明](./deploy/README.md)
- [发布说明](./docs/github-release.md)
- [安全说明](./docs/security.md)
- [常见问题](./docs/troubleshooting.md)
- [开发路线图](./docs/development-roadmap.md)
