# TaskBridge Android 构建说明

本目录是 TaskBridge Android 手机 App。应用使用 Kotlin、Jetpack Compose、Room、Retrofit、OkHttp WebSocket、WorkManager、DataStore、系统通知和 AppWidget 实现本地优先的待办体验。

## 本机环境适配

当前项目已按本机 Windows 开发环境调整：

- Java：JDK 21
- Android Studio：2025.2.2
- Android Studio JBR：21.0.8
- 全局 Gradle：当前 PATH 中没有可用的 `gradle` 命令
- 项目 Gradle Wrapper：Gradle 8.9
- Android SDK Platform：35

请优先使用项目自带的 Gradle Wrapper，不依赖全局 Gradle。

```powershell
cd android
.\gradlew.bat -v
.\gradlew.bat :app:assembleDebug
```

如需固定 Android App 连接的后端地址，请复制本地配置示例：

```powershell
cd android
Copy-Item local.properties.example local.properties
```

然后按注释修改 `TASKBRIDGE_BASE_URL` 和 `TASKBRIDGE_WS_URL`。`local.properties` 已加入 `.gitignore`，适合保存每台开发机自己的后端地址。

注意：这两个地址会在构建时写入 APK 的 `BuildConfig`。修改 `local.properties` 后，需要重新执行 `.\gradlew.bat :app:assembleDebug` 并重新安装 APK。

## 版本配置

Android 模块使用以下版本：

- Android Gradle Plugin 8.7.3
- Gradle Wrapper 8.9
- Kotlin 2.0.21
- KSP 2.0.21-1.0.27
- Compose BOM 2024.12.01
- `minSdk` 26
- `targetSdk` 35
- `compileSdk` 35

## 国内镜像源

项目在 `settings.gradle.kts` 中默认启用国内 Maven 镜像，降低依赖下载失败概率。

仓库顺序：

1. 阿里云 Google Maven 镜像
2. 阿里云 Maven Central 镜像
3. 阿里云 Gradle Plugin 镜像
4. 官方 `google()`
5. 官方 `mavenCentral()`
6. 官方 `gradlePluginPortal()`

如需临时关闭国内镜像：

```powershell
.\gradlew.bat :app:assembleDebug -PTASKBRIDGE_USE_CHINA_MIRRORS=false
```

## 构建命令

普通调试包：

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

## 离线构建说明

如果当前 Shell 禁止联网，Gradle Wrapper 可能无法下载 Gradle 8.9 发行包。可以先在有网络环境执行一次构建，或使用本机已缓存的 Gradle 8.9：

```powershell
$gradle89 = Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.9-bin" -Recurse -Filter gradle.bat |
  Select-Object -First 1 -ExpandProperty FullName
& $gradle89 -p . :app:assembleDebug
```

## 刷新依赖

切换网络或镜像后，可停止 Gradle Daemon 并刷新依赖：

```powershell
.\gradlew.bat --stop
.\gradlew.bat :app:assembleDebug --refresh-dependencies
```

## 主要功能

- 登录、注册、Token 保存和自动刷新。
- 任务列表、今日任务、任务详情、添加和编辑。
- Room 本地缓存和离线操作。
- WorkManager 网络恢复后自动同步。
- 前台 WebSocket 通知，后台不长期保活。
- 系统提醒通知，支持完成和稍后 1 小时。
- 桌面小组件显示今日待办，支持刷新、添加和点击打开 App。
- 分享文本快速添加任务，支持导入 TaskBridge 备份 JSON。

## 小组件测试

1. 安装并登录 App。
2. 长按手机桌面，进入小组件列表。
3. 找到「TaskBridge 今日待办」并添加到桌面。
4. 在 App 内新增、完成或删除今日任务。
5. 返回桌面确认小组件内容已刷新。
6. 点击小组件刷新按钮，验证只读取本地 Room 数据。

## 注意事项

- `GRADLE_HOME` 可能指向旧目录或无效目录，不要依赖它。
- Gradle 8.9 与 Android Gradle Plugin 8.7.3、JDK 21 兼容。
- 小组件不直接请求网络；同步仍由 WorkManager 或 App 主流程完成。
