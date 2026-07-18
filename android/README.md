# TaskBridge Android

`android/` 是 TaskBridge 的 Android 客户端，适合在手机上查看待办、接收提醒，并把今日任务放到桌面小组件。

## 普通用户入口

1. 从项目 Releases 下载 Android APK 并安装。
2. 第一次打开时填写“服务器地址”。已有服务器就填管理员或部署者给你的地址；没有服务器地址时，先回到根目录 README 选择本机试用或长期自托管。
3. 使用已有账号登录；如果服务器开放注册，也可以直接创建账号。
4. 登录后可以查看今日任务、添加待办、接收提醒，并把今日待办小组件添加到手机桌面。

没有服务器时，先看根目录 README 的“没有服务器地址”章节；服务准备好后，再回到 Android 端填写服务器地址并登录。登录会自动检查连接。

第一次使用仍需完成登录。会话自然失效后，登录页会提供本机工作区入口；可以继续查看和修改缓存任务，但不会连接服务器或上传修改，重新登录后才同步。主动退出会清除本机工作区身份。

## 开发者说明

下面内容面向本地开发、构建和发布。应用使用 Kotlin、Jetpack Compose、Room、Retrofit、OkHttp WebSocket、WorkManager、DataStore、系统通知和 AppWidget，实现本地优先的待办体验。

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

这些值会在构建时写入 APK 的 `BuildConfig`，作为首次启动默认地址。安装后也可以在登录 / 注册页的「连接设置」或 App 设置页修改服务器地址。Debug 和 Release 都允许在运行时填写 HTTP / HTTPS API 地址以及 WS / WSS 同步地址；Release 不会因为使用明文 HTTP / WS 而拒绝保存端点。

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
