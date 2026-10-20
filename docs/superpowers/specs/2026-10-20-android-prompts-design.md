# Android 提示交互分类

按当前 Android 工作区统一提示交互，保留已有导航、任务与同步业务。

- Tooltip：短说明与图标解释；帮助入口支持点按，普通按钮支持长按。
- Toast：操作结果，统一浮层反馈、关闭入口与无障碍播报；重复结果以事件编号区分。字段错误继续保留字段标记。
- Popconfirm：删除、退出、覆盖与放弃编辑等确认；锚定触发控件，屏幕边缘自动避让，支持取消、系统返回和点击外部关闭。外部导航等无控件来源时使用窗口内回退位置。
- Drawer：备份预览、首次使用帮助及高级诊断，采用 Material 3 底部抽屉；支持滚动、键盘和安全区。

公共组件放在 `android/app/src/main/java/com/taskbridge/app/ui/components/AppPrompts.kt`，沿用 Material 3 主题。验证反馈事件和弹层定位逻辑，运行 JVM 测试、Debug / AndroidTest 编译、Lint 与 API 35 交互检查。

## 验证结果

- 205 项 JVM 测试通过，Debug 与 AndroidTest APK 构建成功；Lint 为 0 个错误、64 个既有警告。
- API 35 的 TaskBridgeGlass35 模拟器上，20 项仪器测试通过：8 项提示组件行为、3 项设置交互、2 项冲突抽屉、7 项原有布局与导航回归。
- 覆盖无指针语义点击的确认定位、取消与提交、重复 Toast、被替换消息消费、错误源移除、键盘可视区域定位、长按说明、深色长内容抽屉、小屏与大字体导航。
- 设备冷启动的 ART 类验证曾触发应用启动超时。对安装后的应用和测试包分别执行 `adb shell cmd package compile -m speed -f <package>` 后正常完成全部测试；未更改产品初始化逻辑。
- 日志和截图位于忽略目录 `android/.gradle/glass-verification/api35/`：`prompts-build-final.txt`、`prompts-final-device.txt`、`prompts/`。
