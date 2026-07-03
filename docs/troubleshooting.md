# 常见问题

本文档收集 TaskBridge 本地开发、构建、发布和部署时最常见的问题。

## GitHub Release 页面没有产物

发布流程分为 4 类 job：

- Prepare GitHub Release
- Build Android APK
- Build Windows installer
- Build and publish backend image

只有 Android、Desktop 和 Docker 都成功后，最后的 Release job 才会更新完整说明。若某个构建 job 失败，Release 页面可能没有 APK、安装包或镜像说明。

处理方式：

1. 打开失败的 GitHub Actions run。
2. 先看 Android、Desktop、Docker 哪个 job 失败。
3. 修复后重新运行同一个 workflow，或重新推送同一个版本标签前先删除旧标签和旧 Release。

## Android Release 构建失败

Release APK 不会回退到 debug signing。需要已签名产物时，请确认仓库 Secrets 完整：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

本地临时实验请使用 debug 构建。未配置签名 Secrets 时，GitHub Release 会生成明确标注的 unsigned release APK，不要把它当作已签名正式产物：

```powershell
.\gradlew.bat :app:assembleDebug
```

Release workflow 允许发布 unsigned Android artifacts，但文件名会包含 `android-unsigned.apk`。如果只配置了部分 Android 签名 Secrets，workflow 会失败。

## Gradle JDK 配置无效

如果 Android Studio 提示 `Undefined java.home` 或 Gradle JDK 无效：

1. 打开 Android Studio Settings。
2. 进入 Build, Execution, Deployment -> Build Tools -> Gradle。
3. 将 Gradle JDK 改成 Embedded JDK，或选择 JDK 17 / JDK 21。
4. 重新 Sync Project。

项目 CI 使用 JDK 17。

## 桌面端请求后端失败

常见原因：

- Release 构建时没有设置 `TASKBRIDGE_BASE_URL` 和 `TASKBRIDGE_WS_URL`。
- 用户机器上安装的是旧构建，内置的默认后端地址仍指向旧环境。
- API 地址缺少 `/api/v1/`。
- WebSocket 地址没有指向 `/ws/sync`。

桌面端可以在设置页直接修改服务器地址。Android 端可以在登录 / 注册页的「连接设置」或设置页修改服务器地址。发布版会把构建时注入的地址作为默认值；如果默认值错了，可以先在客户端覆盖，后续发布再重新设置仓库 Variables 并构建安装包：

```text
TASKBRIDGE_BASE_URL=http://example.com:8000/api/v1/
TASKBRIDGE_WS_URL=ws://example.com:8000/ws/sync
```

## 桌面端 `better-sqlite3` 绑定文件缺失

错误通常类似：

```text
Could not locate the bindings file
better_sqlite3.node
```

进入 `desktop/` 后执行：

```powershell
npm run rebuild:native
```

`npm run dev` 和 `npm run dist` 会先检查原生模块，缺失时会自动尝试重建。

## Docker 运行后提示 `alembic: error: too few arguments`

不要只把 command 写成 `alembic`。正常部署不需要覆盖 `command`，镜像入口会自动执行：

```sh
alembic upgrade head
```

然后启动 Uvicorn。如果平台必须手动填写 command，请使用：

```sh
sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

## 容器启动失败并提示 `[sh,` 找不到

这是容器平台把 command 拆错了。不要把 JSON 数组写成带方括号的字符串。优先使用镜像默认入口；必须覆盖时，分别填写：

```text
sh
-c
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

不同平台的表单格式不一样，关键是不要让最终命令变成 `"[sh,"`。

## 手机无法访问本机后端

对手机来说，`127.0.0.1` 是手机自己，不是电脑。

- Android 模拟器访问电脑：`http://10.0.2.2:8000`
- 真机访问电脑：使用电脑局域网 IP，例如 `http://192.168.1.10:8000`
- Windows 桌面端访问本机：`http://127.0.0.1:8000`

后端启动时如需允许局域网访问，请使用：

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
