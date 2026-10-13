# Android 液态玻璃实现计划

**目标：** 在现有安卓客户端接入与当前工具链兼容的液态玻璃效果，仅支持 Android 13（API 33）及以上。

**架构：** 页面独立背景图层供玻璃表面采样，前景内容分离；主要面板统一使用模糊 / AGSL 折射，任务行使用 `Quiet` 轻量材质。保留软件画布和缺少可采样背景时的绘图保护。

**技术栈：** Kotlin 2.0.21、Compose 1.7.6、GraphicsLayer、RenderEffect、AGSL；不升级生产依赖。

## 执行步骤

- [x] 检查现有页面与上游依赖，运行原有测试基线（175 项通过）。
- [x] 新建 `android/app/src/main/java/com/taskbridge/app/ui/components/glass/`，实现 `LiquidGlassBackdrop`、`LiquidGlassSurface` 和 `GlassStyle`，处理背景位置、明暗主题和绘图保护。
- [x] 更新 `ui/components/AppUi.kt` 的 `AppPage`、`AppPanel`；更新 `ui/task/TaskListScreen.kt` 的导航及任务行；更新 `ui/editor/EditorScreen.kt` 的透明背景与玻璃底栏；适配系统栏明暗图标。
- [x] 增加 Compose 仪器测试，验证玻璃容器不会阻断点击、输入与滚动，并保存明暗主题截图。
- [x] 运行 `:app:testDebugUnitTest :app:assembleDebug :app:lintDebug :app:assembleDebugAndroidTest`，修复本次变更引入的问题。
- [x] 首次实现时，API 35 使用宿主 GPU、手动 `am instrument` 验证三项测试并保留截图，记录实际验证范围。
- [x] 审查实际 diff，补充 `android/README.md` 的系统要求、参考来源与验证命令。
- [x] 将最低 SDK 调整为 33，移除玻璃组件中按旧系统版本分支的降级逻辑。
- [x] 重新运行构建、JVM 测试、Lint 和受支持系统上的仪器测试，确认 APK 最低 SDK 为 33；175 项 JVM 测试、API 35 的 3 项仪器测试通过，Lint 为 0 错误。

渲染组件与页面接入通过子代理并行实现，由主代理统一构建与集成。工作区已有改动全部保留，不自动提交。
