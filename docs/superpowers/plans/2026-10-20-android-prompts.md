# Android 提示交互实现计划

**目标：** 按 Tooltip、Toast、Popconfirm、Drawer 统一 Android 提示。

**架构：** 公共 Compose 提示组件与页面调用分离，保留业务回调与中英文文案。

**技术栈：** Kotlin、Compose Material 3、JUnit、Compose UI 测试。

- [x] 公共组件：AppPrompts.kt 实现 Tooltip、全局 Toast、带锚点的 Popconfirm 与可滚动 Drawer；验证弹层定位与关闭行为。
- [x] 任务：TaskListScreen.kt、TaskDetailScreen.kt、TaskHomeComponents.kt 迁移确认与图标说明；TaskListViewModel.kt 增加反馈事件编号并验证重复反馈。
- [x] 设置：SettingsScreen.kt 迁移确认、备份预览、高级帮助和操作反馈。
- [x] 登录与编辑：LoginScreen.kt、RegisterScreen.kt、EditorScreen.kt 迁移帮助、短说明与放弃修改确认。
- [x] 全局：MainActivity.kt 接入 Toast host，迁移分享读取错误、导入预览与外部导航确认。
- [x] 验证：执行 `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug`，在 API 35 检查确认取消/提交、抽屉滚动和 Toast；审查剩余提示调用。
