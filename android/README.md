# TaskBridge Android

`android/` 是 TaskBridge 的 Android App。应用使用 Kotlin、Jetpack Compose、Room、Retrofit、OkHttp WebSocket、WorkManager、DataStore、系统通知和 AppWidget，实现本地优先的待办体验。

## 环境要求

- JDK 17
- Android Studio 2025.2.2 或兼容版本
- Android SDK Platform 35
- Gradle Wrapper 8.9

请优先使用项目自带的 Gradle Wrapper，不依赖全局 Gradle。

```powershell
cd android
.\gradlew.bat -v
.\gradlew.bat :app:assembleDebug
```

## 后端地址配置

后端地址可通过 Gradle 参数或 `local.properties` 配置。

复制本地配置：

```powershell
cd android
Copy-Item local.properties.example local.properties
```

常用参数：

```properties
TASKBRIDGE_BASE_URL=http://10.0.2.2:8000/api/v1/
TASKBRIDGE_WS_URL=ws://10.0.2.2:8000/ws/sync
```

这些值会在构建时写入 APK 的 `BuildConfig`。修改后必须重新打包并安装 APK。

## 构建命令

调试包：

```powershell
.\gradlew.bat :app:assembleDebug
```

连接模拟器访问本机后端：

```powershell
.\gradlew.bat :app:assembleDebug `
  -PTASKBRIDGE_BASE_URL=http://10.0.2.2:8000/api/v1/ `
  -PTASKBRIDGE_WS_URL=ws://10.0.2.2:8000/ws/sync
```

连接局域网后端：

```powershell
.\gradlew.bat :app:assembleDebug `
  -PTASKBRIDGE_BASE_URL=http://192.168.1.10:8000/api/v1/ `
  -PTASKBRIDGE_WS_URL=ws://192.168.1.10:8000/ws/sync
```

Release APK：

```powershell
.\gradlew.bat :app:assembleRelease
```

Release 构建必须配置正式签名。缺少 keystore、密码、alias 或 key 密码时，`assembleRelease` 会直接失败，避免误发布 debug 签名 APK。

仅用于本机临时验证的无签名 release 实验，可以显式传入：

```powershell
.\gradlew.bat :app:assembleRelease -PTASKBRIDGE_ALLOW_UNSIGNED_RELEASE=true
```

该方式不适合公开分发，也不会用于 GitHub Release。

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
- 今日任务、全部任务、任务详情、添加和编辑。
- Room 本地缓存和离线操作。
- WorkManager 网络恢复后自动同步。
- 前台 WebSocket 通知。
- 系统提醒通知，支持完成和稍后 1 小时。
- Android 桌面小组件，支持清晰黑字和透明白字两套样式。
- 分享文本快速添加任务。
- 导入 TaskBridge 备份 JSON。

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
