# Android 导航微调实现计划

**目标：** 同步入口直接可见，三个主页面保持一致的玻璃导航和布局节奏。

**架构：** 扩展现有 `TaskHomeScaffold` 供设置页复用，不增加依赖或更改任务业务逻辑。

**技术栈：** Kotlin、Compose Material 3、AGSL、Compose UI 仪器测试。

- [x] `TaskHomeNavigationUiTest.kt`：在 API 35 上复现导航缺少悬浮容器。
- [x] `TaskHomeComponents.kt`：恢复玻璃背景；底栏及导航轨增加 Elevated 玻璃、浮动间距、设置选中态和可选新建按钮。
- [x] `TaskListScreen.kt`：移除单选项更多菜单，直接显示“立即同步”。
- [x] `SettingsScreen.kt`、`MainActivity.kt`：复用主框架与标题，连接今日 / 全部导航与短淡入淡出。
- [x] 执行 Gradle JVM 回归、Debug 构建、AndroidTest 编译及 Lint。
- [x] 在 API 35 检查导航、短屏与液态玻璃仪器测试和截图。

2026-10-19：191 项 JVM 测试、10 项 API 35 仪器测试通过；Debug 构建成功，Lint 0 个错误。人工小屏视口与真实窗口键盘分别验证，详见对应设计文档。
