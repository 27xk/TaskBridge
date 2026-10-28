# GitHub 发布说明

TaskBridge 使用 GitHub Actions 完成持续集成和正式发布。CI 负责校验，Release workflow 负责生成可下载产物、创建 GitHub Release，并同步发布后端 Docker 镜像。

## 工作流

| 文件 | 触发方式 | 用途 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | 推送到 `main` / `master`，或创建 Pull Request | 后端测试、Docker 构建、桌面端构建、Android 构建 |
| `.github/workflows/release.yml` | 推送 `v*` 标签，或手动触发 | 发布自托管部署包、已签名 Android APK、Windows 安装包、GHCR 镜像和 Docker Hub 镜像 |

## Release 产物

发布工作流会生成：

- 自托管部署包：`TaskBridge-<version>-deployment.zip`
- 已签名 Android APK：`TaskBridge-<version>-android.apk`
- Windows 安装包：`TaskBridge-<version>-Setup.exe`（配置证书时签名）
- Windows 自动更新元数据：`latest.yml` 和安装包 `.blockmap`
- 校验清单：`SHA256SUMS.txt`
- 后端 GHCR 镜像：`ghcr.io/<owner>/taskbridge:<version>`
- 后端 GHCR 镜像：`ghcr.io/<owner>/taskbridge:latest`
- 后端 Docker Hub 镜像：`27xk/taskbridge:<version>`
- 后端 Docker Hub 镜像：`27xk/taskbridge:latest`

`latest` 默认会在标签发布时生成。手动触发时可以通过 `publish_latest` 控制是否发布 `latest` 标签。

部署包始终生成，包含 `deploy/`、`web/`、`README.md` 和 `VERSION`。构建时会在临时目录把两个 `.env*.example` 和 Compose fallback 的后端镜像固定到当前发布标签，避免部署包以后被 `latest` 指向的新镜像改变。Android 签名配置必须完整，缺失会阻止正式发布；Windows 未配置证书时仍生成安装包，并在日志中明确说明未签名，部分配置缺失会失败。历史 unsigned APK 只适合开发验证，不应作为普通用户安装包。

## 触发发布

通过标签发布：

```bash
git tag v0.2.1
git push origin v0.2.1
```

手动发布：

1. 打开 GitHub Actions。
2. 选择 `TaskBridge Release`。
3. 点击 `Run workflow`。
4. 输入与 `VERSION` 一致的新版本号，例如 `v0.2.1`，并确认该标签指向待发布提交。
5. 按需选择是否发布 Docker `latest` 标签。

## 必需配置

仓库需要允许 GitHub Actions 写入 Release 和 Packages：

- Settings -> Actions -> General -> Workflow permissions
- 选择 `Read and write permissions`

Docker Hub 同步发布需要配置以下 Secrets：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

默认 Docker Hub 镜像名是 `27xk/taskbridge`。如果要改成其他命名空间，在仓库 Variables 中配置：

- `DOCKERHUB_IMAGE`

例如：

```text
DOCKERHUB_IMAGE=your-dockerhub-name/taskbridge
```

## Android 签名

正式发布必须完整配置以下 Secrets，Release APK 会使用这组持久签名：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

四项全部存在时会构建已签名 APK，并运行 `apksigner verify --verbose --print-certs`。任一项缺失都会在签名准备步骤使 Android 发布 job 失败，并阻止最后的 GitHub Release 发布；不会省略 APK 后继续发布。

生成 `ANDROID_KEYSTORE_BASE64`：

```bash
base64 -w 0 release.keystore
```

PowerShell：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

## Windows 签名

仓库配置以下 Secrets 后，Release workflow 会把证书传给 `electron-builder`：

- `WINDOWS_CERTIFICATE_BASE64`
- `WINDOWS_CERTIFICATE_PASSWORD`

生成 `WINDOWS_CERTIFICATE_BASE64`：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("taskbridge-codesign.pfx"))
```

这两个 Secrets 需要成组配置：两项都存在时会构建签名安装包，并通过 `Get-AuthenticodeSignature` 检查 `.exe` 产物；只配置其中一项时 Windows 发布 job 会失败。两项都未配置时，仍发布 unsigned `.exe`、`latest.yml` 和 `.blockmap`，并在日志及 Release 说明中注明未签名。当前仓库未配置 Windows 签名证书，因此 Windows 安装包可能显示「未知发布者」。

## 权限

工作流使用默认 `GITHUB_TOKEN` 发布 GitHub Release 和 GHCR 镜像，不需要额外个人访问令牌。

需要的 workflow 权限：

- `contents: write`：创建或更新 GitHub Release。
- `packages: write`：推送 Docker 镜像到 GitHub Container Registry。

Docker Hub 使用 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` 登录。建议使用 Docker Hub Access Token，不要使用账号密码。

## 客户端默认后端地址

发布工作流会把仓库 Variables 写入 Android APK 和 Windows 安装包：

- `TASKBRIDGE_BASE_URL`
- `TASKBRIDGE_WS_URL`

示例：

```text
TASKBRIDGE_BASE_URL=http://taskbridge.example.com/api/v1/
TASKBRIDGE_WS_URL=ws://taskbridge.example.com/ws/sync
```

Android 会在构建时写入 `BuildConfig`，发布后不能在 APK 外部修改。桌面端会把它作为默认值，用户仍可在设置页手动调整。

Release workflow refuses to build public artifacts unless both endpoints are configured as repository Variables, use `http://` / `https://` and `ws://` / `wss://`, and do not point at localhost or a private network address. 明文 HTTP / WS 可以用于发布构建；本地局域网和临时测试地址仍不能被写进公开发布产物。

## 常见失败点

### Android 构建失败

检查：

- JDK 是否为 17。
- `gradlew` 是否有执行权限。
- 是否关闭了国内镜像：`-PTASKBRIDGE_USE_CHINA_MIRRORS=false`。
- Android 签名 Secrets 是否完整；任一缺失都会阻止正式发布；已签名 APK 会用 `apksigner verify --verbose --print-certs` 校验。
- `ANDROID_KEYSTORE_BASE64` 解码后是否为空。

### 桌面端打包失败

`electron-builder` 需要下载 Electron 运行时。所有 Windows 发布构建都会设置下列缓存路径：

```text
ELECTRON_CACHE=<workspace>/.cache/electron
ELECTRON_BUILDER_CACHE=<workspace>/.cache/electron-builder
```

这样可以避免系统缓存目录权限问题。配置完整 Windows 签名 Secrets 时，还会设置：

```text
CSC_LINK=<runner temp>/taskbridge-codesign.pfx
CSC_KEY_PASSWORD=<WINDOWS_CERTIFICATE_PASSWORD>
```

配置完整证书时，安装包生成后还会执行 `Get-AuthenticodeSignature`，只有 Authenticode 状态为 `Valid` 才通过签名验证。未配置 Windows 签名 Secrets 时仍发布 unsigned `.exe`，并明确输出未签名提示。

### Docker 发布失败

检查：

- GitHub Actions 是否有 `packages: write` 权限。
- `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` 是否已配置。
- Docker Hub 仓库命名空间是否存在且账号有推送权限。
- GHCR 包名是否为小写。
- `backend/Dockerfile` 是否能在仓库根目录上下文中构建。

### Release 没有产物

发布工作流会先生成自托管部署包，并把已签名 Android APK 和 Windows 安装包上传为 workflow artifacts；Windows 安装包可为未签名版本。最后的 `Publish GitHub Release` job 统一创建 Release 并上传资产。若失败，请先查看 `Build deployment bundle`、`Prepare Android artifact`、`Prepare desktop artifacts` 或 `Download build artifacts` 步骤日志。

如果 Android、Desktop 或 Docker 任一 job 失败，最后的 `Publish GitHub Release` job 不会执行，因此 GitHub Releases 页面不会出现新版本。
最终 Release 一定上传部署包、`SHA256SUMS.txt`、已签名 Android APK、Windows 安装包及其 `latest.yml` 和 `.blockmap`。Windows 自动更新文件会随安装包一起发布，与是否配置签名证书无关；`latest.yml` 和 `.blockmap` 用于桌面端 `latest` channel 自动更新。每次重跑同一标签时，Release job 会先删除旧资产，避免历史 unsigned APK 或 `builder-debug.yml` 残留；上传后会通过 GitHub CLI 反查必需资产并拒绝禁止文件。校验清单用于核对所有下载文件的 SHA-256 摘要。桌面端运行时默认读取 `latest` channel，可用 `TASKBRIDGE_UPDATE_CHANNEL` 指向后续 beta / canary channel，但公开稳定版本必须保持 `latest` channel。

## 本地发布前检查

```powershell
cd backend
python -m pytest tests -q
python -m pytest tests/test_migrations.py -q
python -m compileall -q app tests tools
python -m tools.openapi_contract --check
python -m ruff check app tests tools

cd ..\desktop
npm run check:security-config
npm run check:desktop-endpoint-config
npm run check:release-readiness
npm run check:release-artifacts
npm run check:desktop-auto-update
npm run check:production-hardening
npm run build
```

Android 和 Docker 需要本地具备对应工具链：

```powershell
cd android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat :app:assembleDebug

cd ..
docker compose --env-file deploy/.env.example -f deploy/docker-compose.release.yml config
```
