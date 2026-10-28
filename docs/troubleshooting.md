# 常见问题

本文档按用户遇到问题的顺序组织：先处理服务连接和登录，再处理同步、本机数据，最后才是开发、构建和发布排障。

## 登录或检查连接失败

Web 用户先确认打开的是管理员提供的站点；Windows / Android 用户确认安装的是对应服务的发布包。部署者使用的统一入口例如：

```text
http://example.com:8080
```

发布包会在构建时写入 `/api/v1/` 和 `/ws/sync` 端点，普通用户不需要填写这些路径。

常见处理方式：

1. 确认后端 `/ready` 可用。
2. 检查当前网络能否访问 Web 站点。
3. Windows / Android 用户确认安装包来自当前服务的管理员。
4. 如果发布包内置地址不对，请管理员更新构建变量并重新发布安装包。

使用 Release Compose 时，Web/PWA 从 `http://<服务器>:8080` 打开；Windows 和 Android 发布包的内置端点应指向同一服务。`8000` 仅用于开发直连或独立 API 部署。

## HTTP / WS 与 HTTPS / WSS

TaskBridge 客户端支持明文和加密两种连接：

```text
http://example.com:8080
https://example.com
ws://example.com:8080/ws/sync
wss://example.com/ws/sync
```

Release workflow 和客户端构建不会因为端点使用 `http://` 或 `ws://` 而失败。公网环境建议使用 HTTPS / WSS 反向代理；本机试用、内网或明确接受明文传输的部署可以继续使用 HTTP / WS。

普通 Web 页面在明文 HTTP 下可以使用。Service Worker 和“安装为应用”需要浏览器认可的安全上下文，通常只有 HTTPS、`localhost` 和 `127.0.0.1` 满足；局域网 IP 的 HTTP 页面无法安装 PWA 时，不代表 API 或 WS 连接失败。

Web/PWA 还需要后端允许当前浏览器来源。本机试用可以用：

```text
WEB_CORS_ORIGINS=*
```

长期部署请写明确来源，不要使用通配来源：

```text
WEB_CORS_ORIGINS=http://taskbridge.example.com
WEB_CORS_ORIGINS=https://taskbridge.example.com
```

## 手机无法访问本机后端

对手机来说，`127.0.0.1` 是手机自己，不是电脑。

- Android 模拟器访问 Release Compose：`http://10.0.2.2:8080`
- 真机访问 Release Compose：使用电脑地址，例如 `http://192.168.1.10:8080`
- Windows 桌面端访问本机 Release Compose：`http://127.0.0.1:8080`

仅在不使用 Release Compose、需要开发直连后端时，启动命令才是：

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

如果仍然无法访问，检查系统防火墙、路由器隔离、代理软件和容器端口映射。

## Web 页面打不开或显示 502

Release Compose 默认由 `web` 容器提供 `8080` 入口：

```text
http://127.0.0.1:8080
http://127.0.0.1:8080/ready
```

先运行 `docker compose -f docker-compose.release.yml ps`，确认 `web`、`api`、`mysql` 和 `redis` 都已启动。页面能打开但 API 显示 502 时，再查看 `docker compose -f docker-compose.release.yml logs web api`；通常是 API 尚未健康、数据库密码不一致或迁移失败。

## 客户端显示本机工作区入口

这表示当前没有有效登录会话，但设备仍保留当前服务器和上次账号对应的任务缓存。可以先进入本机任务继续记录；恢复联网后点击“登录并同步”，使用同一账号登录后才会上传待同步修改。

Web/PWA 固定连接当前站点的同源 API，正常关闭浏览器后会先通过 HttpOnly Cookie 自动恢复登录。只有 Cookie 已失效、被撤销、用户主动退出，或恢复请求无法完成时，才会停留在登录页并评估是否显示“继续离线使用”。

本机模式不会保存或恢复 Token，也不会启动 WebSocket、后台 Worker 或上传队列。主动退出、切换服务器或清除此设备数据后，该入口会消失；普通断网、服务器暂不可用或会话自然失效不会删除任务缓存。

Windows 和 Android 会在刷新会话被服务器拒绝时保留本机工作区。Web 还需要满足下面的浏览器缓存条件：

如果入口没有出现，请依次确认：

1. 当前 Web 站点或客户端安装包连接的服务与创建缓存时一致；服务身份会与离线缓存来源比较。
2. 这个账号至少成功加载或创建过任务，使对应 IndexedDB 写入 `cache_ready` 标记。
3. 浏览器没有清除站点数据，也没有处于禁止 IndexedDB 的隐私模式。

升级自旧版本时，Web/PWA 会把仅按用户 ID 命名的旧数据库迁移到当前服务器工作区。迁移过程中不要同时打开多个旧版本页面操作同一份缓存。

## 服务地址需要变更时

普通用户无法在发布包内修改服务地址。以下情况由管理员调整部署与构建参数后重新发布：

- 反向代理把 API 和同步连接放在不同路径或域名。
- 旧安装包内置地址不正确。
- 部署者明确给了独立的请求地址或同步连接地址。

构建时请求地址应以 `http://` 或 `https://` 开头；同步连接地址应以 `ws://` 或 `wss://` 开头。开发构建仍可在应用内切换测试端点。

## 同步状态需要处理

如果任务列表上方或设置页提示「同步问题」，按这个顺序处理：

1. 先刷新同步状态。
2. 如果有待同步任务，保持客户端在线等待自动同步。
3. 如果有同步失败任务，先确认服务仍然可用，再重试同步。
4. 如果出现冲突，比较「这台设备」和「同步来的版本」，选择要保留的一份。
5. 在问题没有处理完之前，不要清除此设备数据。

## 清除这台设备数据前要确认什么

清除这台设备数据只会删除当前设备上的登录状态、本机缓存和等待同步的修改，不会删除服务器上的任务。

清除前先确认：

- 没有待同步任务。
- 没有同步失败任务。
- 没有未处理冲突。
- 已经导出本机备份，或确认本机缓存可以丢弃。

不确定时先导出本机备份，再做清除。

## 导出诊断和备份

排障时优先导出普通用户能理解的材料：

- 当前服务器地址。
- 同步状态截图。
- 任务冲突截图。
- 本机备份文件。
- 客户端版本号。

Android 可在“设置 -> 偏好 -> 关于”查看已安装版本并打开最新 Release；Windows 桌面端可在设置页查看版本信息。

只有维护者要求时，再打开技术信息或错误上报。技术信息用于定位连接、同步队列、请求路径和客户端版本，不需要普通用户长期打开。

普通用户排障到这里就够了。下面的内容面向维护者、部署者和构建发布人员，只有在处理 Release、Android 构建、桌面端原生模块或容器启动问题时才需要继续阅读。

## GitHub Release 页面没有产物

发布流程分为 6 类 job：

- Prepare Release
- Build self-hosting bundle
- Build Android APK
- Build Windows installer
- Build and publish backend image
- Update GitHub Release

所有 job 成功后，最后的 Release job 才会更新说明并上传完整产物。Android 的四项签名 Secrets 缺少任一项都会阻止发布。Windows 的两项签名 Secrets 都为空时仍发布未签名安装包和自动更新文件；只配置其中一项会使 Windows job 失败。

处理方式：

1. 打开失败的 GitHub Actions run。
2. 先看 Android、Desktop、Docker 哪个 job 失败。
3. 修复后重新运行同一个 workflow。Release job 会先删除同标签旧资产，再上传当前构建，并检查部署 ZIP、`SHA256SUMS.txt` 和禁止资产。

## Android Release 构建失败

Release APK 不会回退到 debug signing。正式发布必须完整配置以下仓库 Secrets：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

本地临时实验请使用 debug 构建：

```powershell
.\gradlew.bat :app:assembleDebug
```

本地 `assembleRelease` 仍可生成 unsigned release APK 供开发验证，但 unsigned APK 不应进入公开 Release。四项 Android 签名 Secrets 中任一项缺失，workflow 都会失败并列出缺失项，不会省略 APK 后继续发布。

Windows 安装包当前未签名，仍会随 `latest.yml` 和 `.blockmap` 一起发布，安装时可能显示「未知发布者」。维护者配置完整的 Windows 证书和密码后，工作流才会签名并校验安装包。

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
- 请求地址缺少 `/api/v1/`。
- 同步连接地址没有指向 `/ws/sync`。

如果发布包内置地址有误，更新仓库 Variables 并重新构建安装包：

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
