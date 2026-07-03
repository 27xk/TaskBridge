# 开发路线图

本文档记录 TaskBridge 的阶段目标、当前状态和后续优化方向。

## 阶段 1：项目骨架

状态：已完成。

- 建立后端、Android 和 Windows 桌面端目录。
- 编写架构、API、同步和路线图文档。
- 增加 MySQL、Redis 和后端 Docker Compose。
- 创建 FastAPI 基础应用。
- 创建 Android Compose 基础应用。
- 创建 Electron + Vue 3 + TypeScript 基础应用。

## 阶段 2：后端 MVP

状态：已完成。

- SQLAlchemy 模型和 Alembic 迁移。
- JWT 鉴权和 Refresh Token。
- 用户注册、登录、刷新和当前用户接口。
- 任务 CRUD、软删除和用户归属校验。
- 设备注册、列表和删除。
- 统一响应结构和异常处理。
- 后端测试覆盖认证、任务、设备和同步接口。

## 阶段 3：同步与通知

状态：已完成。

- HTTP 增量拉取。
- 客户端离线变更上传。
- 任务 `version` 冲突检测。
- 同步日志 `sync_logs`。
- WebSocket 在线设备管理、心跳和断线支持。
- 同账号多设备通知。
- WebSocket 短期 Ticket。
- 同步状态接口返回数据库、WebSocket 和同步限额，后端测试覆盖跨设备推送、通知、拉取、更新和冲突链路。

## 阶段 4：Android MVP

状态：已完成。

- Room 任务表和同步队列表。
- Retrofit API 客户端。
- 本地优先 TaskRepository。
- WorkManager 后台同步。
- 登录、注册、任务列表、今日任务和任务编辑。
- 前台 WebSocket 通知。
- 系统提醒和桌面小组件。
- 小组件样式切换。

## 阶段 5：Windows MVP

状态：已完成。

- SQLite 本地缓存。
- HTTP 同步和 WebSocket 监听。
- 登录、注册、任务列表和今日任务。
- 系统托盘。
- 桌面悬浮窗。
- 全局快捷键 `Ctrl + Alt + T`。
- 系统通知、开机自启和本地提醒。
- 隐藏 Electron 默认菜单栏。

## 阶段 6：效率增强

状态：基础能力已完成，仍可继续打磨。

- 批量完成和批量删除。
- 项目和标签管理。
- 任务模板。
- 重复任务下一次生成。
- 子清单。
- 导入导出。
- 冲突处理。
- Android 分享文本添加任务。
- Windows 备份导入导出。
- Windows 备份导出改为分页全量导出，导入时返回明确错误、扫描数量和跳过数量。

## 阶段 7：低配设备优化

状态：进行中。

已完成：

- 客户端本地优先，减少等待网络的 UI 阻塞。
- 小组件和悬浮窗读取本地数据库，不直接请求网络。
- 任务列表按时间线排序，逾期和未完成状态分组展示。
- 移除不合适的「完成当前」和「删除当前」快捷操作。
- 桌面端移除不必要的 Axios 依赖，使用原生 `fetch`。
- 同步队列持久化，失败后延迟重试。
- Android release 构建开启代码压缩和资源压缩。
- Docker 部署默认不暴露 MySQL 和 Redis。
- Electron renderer 启用 sandbox，并收紧 IPC 调用入口。

后续建议：

- 为 Room 和 SQLite 补充常用查询索引。
- 限制桌面悬浮窗渲染条数，减少常驻内存。
- 对大批量导入使用分批写入。
- 建立 Android、桌面端和后端的性能基准。
- 在 CI 中增加产物大小检查。

## 阶段 8：发布准备

状态：进行中。

已完成：

- CI 工作流：后端测试、Docker 构建、桌面端构建、Android 构建。
- Release 工作流：Android APK、Windows 安装包和后端 Docker 镜像。
- GHCR 后端镜像发布。
- Android release 签名强校验，缺少签名配置时发布失败。
- 发布说明文档。
- 安全说明和常见问题文档。
- 后端响应增加 `X-Request-ID`、基础安全头和数据库 readiness 探针。
- 后端增加 `/metrics` Prometheus 文本指标，并支持 `METRICS_TOKEN` 保护生产指标采集。

后续建议：

- 增加 Windows 代码签名。
- 增加生产部署文档和 Nginx 反向代理示例。
- 增加数据库备份和恢复文档。
- 增加崩溃日志、错误上报、指标面板、告警阈值和同步异常追踪。
