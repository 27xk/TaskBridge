# TaskBridge Windows 桌面端

`desktop/` 是 TaskBridge 的 Electron 桌面端。应用使用 Vue 3、TypeScript、Pinia、SQLite、electron-store 和 electron-builder，提供主窗口、系统托盘、悬浮窗、全局快捷键和本地提醒。

## 环境要求

- Windows 10/11
- Node.js 22
- npm

## 本地启动

```powershell
cd desktop
npm ci
npm run dev
```

## 常用命令

```powershell
npm run check:security-config
npm run check:desktop-endpoint-config
npm run typecheck
npm run build
npm run dist
npm run rebuild:native
```

如果启动后出现 `Could not locate the bindings file` 或 `better_sqlite3.node` 相关错误，说明 SQLite 原生模块没有为当前 Electron 版本生成。进入 `desktop/` 后执行：

```powershell
npm run rebuild:native
```

`npm run dev` 和 `npm run dist` 会先检查该文件，缺失时会自动尝试重建。

说明：

- `npm run build` 构建 Electron 主进程、preload 和 renderer。
- `npm run dist` 生成 Windows 安装包，输出目录为 `desktop/release/`。
- 主窗口默认隐藏 Electron 菜单栏。
- 悬浮窗使用独立入口，不受主窗口布局样式影响。
- `npm run check:security-config` 检查 Electron sandbox、IPC 入口、Android release 签名和 Docker 端口配置。
- `npm run check:desktop-endpoint-config` 检查桌面端是否正确使用构建时注入的后端地址。

## 功能

- 登录、注册、Token 保存和自动刷新。
- 今日任务、全部任务和设置页。
- SQLite 本地缓存和离线同步队列。
- WebSocket 常驻连接，收到通知后拉取增量数据。
- 系统托盘和手动同步。
- 桌面悬浮窗显示今日任务。
- 全局快捷键 `Ctrl + Alt + T`。
- 系统通知和本地提醒。
- 导入导出备份 JSON。

## 后端地址

桌面端默认后端地址在构建时注入。GitHub Release 会读取仓库 Variables：

- `TASKBRIDGE_BASE_URL`
- `TASKBRIDGE_WS_URL`

本地打包时可这样指定：

```powershell
$env:TASKBRIDGE_BASE_URL="http://192.168.1.10:8000/api/v1/"
$env:TASKBRIDGE_WS_URL="ws://192.168.1.10:8000/ws/sync"
npm run dist
```

用户安装后也可以在设置页修改 API 地址和 WebSocket 地址。应用会迁移旧版本内置的默认地址，但会保留用户手动改过的地址。

## 安全边界

- 主窗口和悬浮窗启用 `contextIsolation`、禁用 `nodeIntegration`，并启用 renderer sandbox。
- Preload 只暴露受控的 `window.taskBridge` 能力。
- Renderer 不能直接写入 Token；登录、注册和刷新 Token 后由主进程保存。
- IPC handler 会校验调用方是否来自当前主窗口或悬浮窗。

## 打包注意事项

`electron-builder` 会下载 Electron 运行时。如果本机网络受限，`npm run dist` 可能失败在 Electron zip 下载阶段。GitHub Actions 的 Windows runner 通常可以正常下载。

发布 workflow 已设置：

```text
CSC_IDENTITY_AUTO_DISCOVERY=false
ELECTRON_CACHE=<workspace>/.cache/electron
ELECTRON_BUILDER_CACHE=<workspace>/.cache/electron-builder
```

这样可以避免使用系统级 Electron 缓存目录导致权限问题。

## 本地验证

```powershell
cd desktop
npm run typecheck
npm run build
```
