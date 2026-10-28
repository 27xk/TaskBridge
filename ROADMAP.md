# Roadmap

TaskBridge 的路线图按「可用性、同步稳定性、发布体验」推进。

## 已完成

- 后端认证、设备、任务和同步 API。
- Android App 本地优先任务管理。
- Windows 桌面端主窗口、托盘和悬浮窗。
- HTTP 增量同步和 WebSocket 通知。
- Android 小组件。
- GitHub Actions CI。
- GitHub Release 发布 Android APK、Windows 安装包和后端 Docker 镜像。
- 发布安全检查：Android 正式签名校验、Electron sandbox、IPC sender 校验和 Docker 内网数据库。
- 项目截图、Demo 脚本、贡献指南和排障文档。
- 数据库原子版本保护、安全同步水位、统一提交后通知与 Redis 跨进程分发。
- 桌面列表摘要和按需详情、Web 增量缓存及有界列表。
- 完整 HTTP 响应契约、桌面生成网络类型和跨语言序列化样本。
- 备份恢复文档、隔离恢复演练入口及同步健康监控示例。
- 桌面自动更新、Windows 可选代码签名与发布签名校验支持。

## 近期计划

- 发布首个稳定 Release，并整理安装包下载说明。
- 录制演示视频。
- 在目标部署环境定期执行自动备份和隔离恢复演练，保存报告。
- 增加端到端同步测试。
- 增加 Android 和 Windows 的性能基准。
- 为实际发布配置 Windows 签名证书并验证签名产物。

## 长期计划

- 更细粒度的字段级冲突合并。
- 更完整的重复任务规则。
- 多语言文档。
- 验证自动更新渠道的实际发布与升级流程。
- 更完善的数据导入导出格式。
