# Android 液态玻璃设计

## 目标与范围

参考 [AndroidLiquidGlass / Backdrop](https://github.com/Kyant0/AndroidLiquidGlass)，为现有 Compose 客户端加入透明材质、背景模糊、边缘折射和高光。应用仅支持 Android 13（API 33）及以上，最低 SDK 为 33。保留绿色品牌、系统深色模式、页面结构、任务选择与表单行为。

## 技术选择

直接引入 Backdrop 需要升级工具链：最早稳定版 1.0.0 也依赖 Kotlin 2.2.21、Compose 1.9.4；本项目为 Kotlin 2.0.21、Compose 1.7.6。采用与现有工具链兼容的独立渲染组件，参考其分层采样原理，不复制库源码，不增加生产依赖。

- `LiquidGlassBackdrop` 在页面背景绘制静态、柔和的绿色 / 青色 / 暖色光晕，录制独立 `GraphicsLayer`。
- `LiquidGlassSurface` 按自身位置采样背景。背景效果层与文字、按钮、输入框分离，避免正文被模糊或折射。
- `Elevated` 用于主导航和编辑操作栏；`Panel` 用于登录、注册、设置、详情、编辑面板；`Quiet` 用于大量重复任务行，减少滚动中的 GPU 开销。
- 采样对象仅是页面装饰背景，不录制表单和玻璃自身，不形成递归绘制。

## 系统要求与渲染

Android 13（API 33）及以上统一使用背景模糊、AGSL 圆角边缘折射、高光和半透明染色，不保留按旧系统版本分支的材质降级。`Quiet` 继续用于长列表轻量绘制；软件画布或缺少可采样背景时只绘制染色与高光，作为绘图保护。

每个折射面板持有自己的 Shader；图层由 Compose 生命周期释放。背景不使用无限动画，不逐帧截图，不增加后台任务。

## 交互与可读性

主导航保持 Today / All / Settings 的位置和回调，Today / All 暴露 `Role.Tab`、选中状态，保持至少 48 dp 触摸高度与换行能力。任务行保留长按选择、复选框、逾期 / 选中边框。编辑底栏避让键盘。深色模式保持清晰前景色；`MainActivity.enableEdgeToEdge()` 同步处理系统栏图标与背景对比。

## 验收

运行现有 Android JVM 测试、Debug 构建及 Lint，并确认 APK 最低 SDK 为 33。使用 Compose 仪器测试检查玻璃上文字、输入、点击和滚动，并在 Android 13 及以上的可用模拟器上检查明暗主题截图。真实折射必须在硬件加速窗口验证。

## 验证记录（2026-10-09）

最低版本调整为 Android 13 后，已重新完成构建与回归验证。

- Debug APK 构建成功，175 项 JVM 测试通过；Lint 为 0 个错误、61 个警告，警告主要涉及依赖版本、目标 SDK 和已有资源。
- `aapt2 dump badging` 确认 APK 的 `minSdkVersion:'33'`、`targetSdkVersion:'35'`。
- Android 15 / API 35：重新运行的三项测试全部通过，没有按版本跳过，包括相同条纹输入下 AGSL 折射与普通模糊的像素对比；首次实现时的登录页明暗主题截图也已人工检查。
- 尚未做实体手机性能测试。
- 截图与 API 35 仪器日志保存在本地忽略目录 `android/.gradle/glass-verification/api35/`，本轮日志为 `instrumentation-android13-min.txt`。

本机 Android Emulator 35.4.9 的 SwiftShader 后端在完整页面绘制时发生宿主进程访问异常；ANGLE 参数也被该模拟器回退为 SwiftShader。改用 `-gpu host -feature -Vulkan` 后，日志确认使用 NVIDIA OpenGL，完整测试与页面检查通过。复现时建议选择宿主 GPU；此问题没有通过禁用应用折射来绕过。

保留截图的手动复现方式（先构建 Debug APK 与 AndroidTest APK）：

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -r com.taskbridge.app.test/androidx.test.runner.AndroidJUnitRunner
adb pull /sdcard/Android/data/com.taskbridge.app/files/liquid-glass ./glass-screenshots
```

Gradle 的连接测试可能在结束时卸载测试应用，手动运行方便在卸载前拉取截图。设备有多个时，给每条 `adb` 命令指定 `-s <serial>`。
