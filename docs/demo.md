# Demo 脚本

本文档用于录制演示视频、编写发布说明或向新用户介绍 TaskBridge。

## 演示目标

让用户在 2 分钟内理解 TaskBridge 解决的问题：

- 任务可以在 Android 和 Windows 之间同步。
- 离线操作不会丢失。
- 今日视图能区分逾期、未完成和已完成任务。
- Android 小组件和 Windows 悬浮窗适合日常快速查看。
- 后端可以自托管。

## 推荐演示流程

### 1. 启动后端

```bash
cd deploy
cp .env.example .env
docker compose -f docker-compose.release.yml up -d
```

展示健康检查：

```text
http://127.0.0.1:8000/health
```

### 2. 登录同一账号

在 Android App 和 Windows 桌面端分别登录同一个账号。

### 3. 在桌面端创建任务

创建 3 个任务：

- 今天 10:00 前提交日报。
- 明天 09:00 检查服务器。
- 高优先级：整理发布清单。

展示桌面端今日视图和任务分组。

### 4. 在 Android 查看同步结果

打开 Android App，展示任务已经同步到移动端。

### 5. 展示小组件

添加「TaskBridge 今日待办」小组件，切换两套样式：

- 清晰黑字。
- 透明白字。

### 6. 展示离线修改

断开网络后，在 Android 完成一个任务。恢复网络后，在 Windows 桌面端查看状态同步。

### 7. 展示 Windows 悬浮窗

打开悬浮窗，展示今日任务和快速查看体验。

## 截图清单

建议在正式发布前补充以下真实截图：

- Windows 今日页。
- Windows 设置页。
- Android 今日任务列表。
- Android 设置页。
- Android 小组件两种样式。
- GitHub Release 下载页面。
- Docker 一键部署后的健康检查结果。

