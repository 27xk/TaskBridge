# GitHub 发布说明

TaskBridge 使用 GitHub Actions 完成持续集成和正式发布。CI 负责校验，Release workflow 负责生成可下载产物、创建 GitHub Release，并同步发布后端 Docker 镜像。

## 工作流

| 文件 | 触发方式 | 用途 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | 推送到 `main` / `master`，或创建 Pull Request | 后端测试、Docker 构建、桌面端构建、Android 构建 |
| `.github/workflows/release.yml` | 推送 `v*` 标签，或手动触发 | 发布 Android APK、Windows 安装包、GHCR 镜像和 Docker Hub 镜像 |

## Release 产物

发布工作流会生成：

- Android APK：`TaskBridge-<version>-android.apk`
- Windows 安装包：`TaskBridge-<version>-Setup.exe`
- Windows 自动更新元数据：`latest.yml` 和安装包 `.blockmap`
- 校验清单：`SHA256SUMS.txt`
- 后端 GHCR 镜像：`ghcr.io/<owner>/taskbridge:<version>`
- 后端 GHCR 镜像：`ghcr.io/<owner>/taskbridge:latest`
- 后端 Docker Hub 镜像：`27xk/taskbridge:<version>`
- 后端 Docker Hub 镜像：`27xk/taskbridge:latest`

`latest` 默认会在标签发布时生成。手动触发时可以通过 `publish_latest` 控制是否发布 `latest` 标签。

## 触发发布

通过标签发布：

```bash
git tag v0.1.6
git push origin v0.1.6
```

手动发布：

1. 打开 GitHub Actions。
2. 选择 `TaskBridge Release`。
3. 点击 `Run workflow`。
4. 输入版本号，例如 `v0.1.6`。
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

仓库配置以下 Secrets 后，Release APK 会使用正式签名：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

这些 Secrets 是正式发布的强制配置。缺少任一项时，Android 发布 job 会失败，不会回退到 debug signing，也不会发布 unsigned Android artifacts。APK 构建完成后，Release workflow 会继续运行 `apksigner verify --verbose --print-certs`；签名验证失败的 APK 不会上传。

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

缺少任一项时 Windows 发布 job 会失败，不会发布未签名安装包。安装包构建完成后，Release workflow 会通过 `Get-AuthenticodeSignature` 检查 `.exe` 产物；签名状态不是 `Valid` 时不会上传。

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
TASKBRIDGE_BASE_URL=https://taskbridge.example.com/api/v1/
TASKBRIDGE_WS_URL=wss://taskbridge.example.com/ws/sync
```

Android 会在构建时写入 `BuildConfig`，发布后不能在 APK 外部修改。桌面端会把它作为默认值，用户仍可在设置页手动调整。

Release workflow refuses to build public artifacts unless both endpoints are configured as repository Variables, use `https://` / `wss://`, and do not point at localhost or a private network address. 本地局域网、明文 HTTP 和临时测试地址只能用于开发构建，不能被写进公开发布产物。

## 常见失败点

### Android 构建失败

检查：

- JDK 是否为 17。
- `gradlew` 是否有执行权限。
- 是否关闭了国内镜像：`-PTASKBRIDGE_USE_CHINA_MIRRORS=false`。
- release 签名 Secrets 是否完整；正式 Release 不允许发布 unsigned Android artifacts，并且会用 `apksigner verify --verbose --print-certs` 校验最终 APK。
- `ANDROID_KEYSTORE_BASE64` 解码后是否为空。

### 桌面端打包失败

`electron-builder` 需要下载 Electron 运行时，并且发布工作流要求 Windows 签名 Secrets 完整。发布工作流已设置：

```text
CSC_LINK=<runner temp>/taskbridge-codesign.pfx
CSC_KEY_PASSWORD=<WINDOWS_CERTIFICATE_PASSWORD>
ELECTRON_CACHE=<workspace>/.cache/electron
ELECTRON_BUILDER_CACHE=<workspace>/.cache/electron-builder
```

这样可以避免系统缓存目录权限问题。安装包生成后还会执行 `Get-AuthenticodeSignature`，只有 Authenticode 状态为 `Valid` 的 `.exe` 才会作为发布产物上传。

### Docker 发布失败

检查：

- GitHub Actions 是否有 `packages: write` 权限。
- `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` 是否已配置。
- Docker Hub 仓库命名空间是否存在且账号有推送权限。
- GHCR 包名是否为小写。
- `backend/Dockerfile` 是否能在仓库根目录上下文中构建。

### Release 没有产物

发布工作流会先把 Android APK 和 Windows 安装包上传为 workflow artifacts，最后的 `Publish GitHub Release` job 才会统一创建 Release 并上传资产。若失败，请先查看对应 job 的 `Prepare Android artifact`、`Prepare desktop artifacts` 或 `Download build artifacts` 步骤日志。

如果 Android、Desktop 或 Docker 任一 job 失败，最后的 `Publish GitHub Release` job 不会执行，因此 GitHub Releases 页面不会出现新版本。
最终 Release 会额外上传 `latest.yml`、`.blockmap` 和 `SHA256SUMS.txt`；前两者用于桌面端 `latest` channel 自动更新，校验清单用于核对 APK、Windows 安装包和更新元数据的 SHA-256 摘要。桌面端运行时默认读取 `latest` channel，可用 `TASKBRIDGE_UPDATE_CHANNEL` 指向后续 beta / canary channel，但公开稳定版本必须保持 `latest` channel。

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
