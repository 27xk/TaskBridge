# TaskBridge Android

`android/` 是 TaskBridge 的 Android 客户端，仅支持 Android 13（API 33）及以上，适合在手机上查看待办、接收提醒，并把今日任务放到桌面小组件。

## 普通用户入口

1. 从项目 Releases 下载 Android APK 并安装。
2. 使用对应服务的发布 APK；服务地址已在构建时写入。
3. 使用已有账号登录；如果服务器开放注册，也可以直接创建账号。
4. 登录后可以查看今日任务、添加待办、接收提醒，并把今日待办小组件添加到手机桌面。

没有服务入口时，请向管理员索取对应 APK 和账号。连接失败时检查网络，并联系管理员确认服务状态；Debug 构建保留手动地址设置用于调试。

第一次使用仍需完成登录。会话自然失效后，登录页会提供本机工作区入口；可以继续查看和修改缓存任务，但不会连接服务器或上传修改，重新登录后才同步。主动退出会清除本机工作区身份。

忘记密码时，登录页会提示联系服务器管理员重置。仍能登录时，可以在“设置 > 账号安全”中使用当前密码修改。

任务列表支持进入选择模式后批量完成或删除当前可见任务；回收站中的批量恢复和永久删除继续使用独立确认。设置页使用可扫描的分类入口切换偏好、连接、账号、数据与备份和同步问题，不需要在首屏阅读全部设置说明。

列表按每页 100 条展示，页头显示筛选后的完整总数；可用“上一页 / 下一页”访问后续任务。搜索覆盖当前视图中的全部任务，包括尚未翻到的页面。“全选本页”只选择当前页的未完成任务，翻页会清除选择。正文和清单在详情或编辑时读取，批量操作、撤销和模板创建会保留完整记录。

## 开发者说明

下面内容面向本地开发、构建和发布。应用使用 Kotlin、Jetpack Compose、Room、Retrofit、OkHttp WebSocket、WorkManager、DataStore、系统通知和 AppWidget，实现本地优先的待办体验。

`TaskBridgeApplication` 持有进程内唯一的 `AppContainer`，Activity、Receiver 和 Worker 通过 `Context.appContainer` 复用它。应用协程作用域随进程存活，前台 WebSocket 在页面生命周期停止时断开；`close()` 供运行时清理使用。列表只订阅当前视图的一页记录，搜索、筛选、排序和统计在数据库中完成，离开页面即释放订阅。

同步请求统一交给 WorkManager，并共用同一个同步协调器。排队中的请求会合并；同步执行期间的新修改保留一个后续请求，断网后仍由网络约束恢复执行。提醒只处理提交后发生变化的任务，未变化的触发时间不会重新设置闹钟；进程恢复、工作区切换和系统时间事件会重新核对提醒。小组件存在时才调度刷新，页面无需长期订阅今日任务。

## 液态玻璃界面

页面背景、主导航、登录 / 设置 / 详情 / 编辑面板以及编辑底栏使用统一玻璃材质，跟随系统浅色和深色主题。任务行使用轻量半透明材质，保留任务选择、逾期边框和原有操作。

实现参考 [Kyant0/AndroidLiquidGlass（现 Backdrop）](https://github.com/Kyant0/AndroidLiquidGlass) 的独立背景采样与前景分层原理，在现有 Kotlin / Compose 版本上独立实现，没有引入上游库或复制其源码。上游最早稳定版也需要更新的 Kotlin / Compose；本次保留现有生产依赖版本。

所有支持的系统版本均使用背景模糊、AGSL 边缘折射、半透明染色和高光，无需按系统版本选择材质。

渲染组件位于 `ui/components/glass/`。它只采样页面装饰背景，文字、按钮、输入框在独立前景绘制；背景没有持续动画，重复任务行不创建折射图层。软件画布或缺少可采样背景时保留染色与高光，确保绘制安全。

连接模拟器或测试设备后，可运行材质交互和像素验证：

```powershell
.\gradlew.bat :app:connectedDebugAndroidTest
```

`LiquidGlassRenderingTest` 检查明暗主题下的输入、点击和滚动，并对比折射与普通模糊的像素输出。测试截图保存在测试设备的应用外部文件目录 `files/liquid-glass/`；实际设备覆盖情况见[设计与验证记录](../docs/superpowers/specs/2026-10-09-android-liquid-glass-design.md)。

## 环境要求

- JDK 17
- Android Studio 2025.2.2 或兼容版本
- Android SDK Platform 35
- 应用最低运行版本：Android 13（API 33）
- Gradle Wrapper 8.9

请优先使用项目自带的 Gradle Wrapper，不依赖全局 Gradle。

```powershell
cd android
.\gradlew.bat -v
.\gradlew.bat :app:assembleDebug
```

## 后端地址配置

后端地址可通过 Gradle 参数或 `local.properties` 配置。

连接电脑上的 Release Compose 本机试用服务时，Android 真机填写 `http://<电脑局域网 IP>:8080`，模拟器填写 `http://10.0.2.2:8080`。

复制本地配置：

```powershell
cd android
Copy-Item local.properties.example local.properties
```

下面参数用于不经过 Release Compose 代理、直接连接开发后端：

```properties
TASKBRIDGE_BASE_URL=http://10.0.2.2:8000/api/v1/
TASKBRIDGE_WS_URL=ws://10.0.2.2:8000/ws/sync
```

这些值会在构建时写入 APK 的 `BuildConfig`。Release 包固定使用构建地址，普通用户无需也不能在应用内修改；Debug 包保留运行时地址设置，供开发和排障使用。

## 构建命令

调试包：

```powershell
.\gradlew.bat :app:assembleDebug
```

开发直连：模拟器访问本机后端：

```powershell
.\gradlew.bat :app:assembleDebug `
  -PTASKBRIDGE_BASE_URL=http://10.0.2.2:8000/api/v1/ `
  -PTASKBRIDGE_WS_URL=ws://10.0.2.2:8000/ws/sync
```

开发直连：连接局域网后端：

```powershell
.\gradlew.bat :app:assembleDebug `
  -PTASKBRIDGE_BASE_URL=http://192.168.1.10:8000/api/v1/ `
  -PTASKBRIDGE_WS_URL=ws://192.168.1.10:8000/ws/sync
```

Release APK：

```powershell
.\gradlew.bat :app:assembleRelease
```

本地 `assembleRelease` 仍允许生成 unsigned APK 用于开发验证，不会回退到 debug signing。配置完整 keystore、密码、alias 和 key 密码时，本地构建会生成已签名 APK。

GitHub Release workflow 的发布条件不同：配置完整 Android 签名时，workflow 才会构建并上传公开 APK；未配置完整 Android 签名时，Release workflow 只运行测试并省略 APK 发布，不会上传 unsigned APK。unsigned release 仅用于本地开发验证，不应作为公开下载文件。

## Release 签名

可通过 Gradle 属性或环境变量配置：

| 变量 | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_PATH` | keystore 文件路径 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key 密码 |

GitHub Actions 发布时还支持 `ANDROID_KEYSTORE_BASE64`，详见 [GitHub 发布说明](../docs/github-release.md)。

生成 base64 内容：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

## 国内镜像

`settings.gradle.kts` 默认启用国内 Maven 镜像。CI 或海外网络环境可关闭：

```powershell
.\gradlew.bat :app:assembleDebug -PTASKBRIDGE_USE_CHINA_MIRRORS=false
```

## 主要功能

- 登录、注册、Token 保存和自动刷新。
- 冷启动先等待本机登录态读取完成，不会短暂闪现登录页；Token 被清除或失效后会自动返回登录页。
- 今日任务、全部任务、任务详情、添加和编辑。
- 编辑中的表单和“是否有未保存修改”状态通过 `SavedStateHandle` 恢复；Android 回收并重建进程后仍可继续编辑，保存成功或确认放弃后清除恢复草稿。
- Room 本地缓存和离线操作。
- WorkManager 网络恢复后自动同步。
- 前台 WebSocket 通知。
- 系统提醒通知，支持完成和稍后 1 小时。
- Android 桌面小组件，支持清晰黑字和透明白字两套样式。
- 分享文本快速添加任务。
- 导入 TaskBridge 备份 JSON。
- 登录、注册和设置中的帮助链接在系统没有可用浏览器时显示错误提示，不会导致 App 崩溃。

## 小组件测试

1. 安装并登录 App。
2. 长按手机桌面，进入小组件列表。
3. 添加「TaskBridge 今日待办」。
4. 在 App 内新增、完成或删除今日任务。
5. 返回桌面确认小组件已刷新。
6. 在设置页切换小组件样式，确认文字和背景符合预期。

## 测试

```powershell
cd android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat :app:assembleDebug
```

CI 使用 JDK 17 和 Gradle Wrapper。若本地提示 `Undefined java.home` 或 Gradle JDK 无效，请在 Android Studio 中选择 Embedded JDK，或选择已安装的 JDK 17 / JDK 21 后重新同步项目。
