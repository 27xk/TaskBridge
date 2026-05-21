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
- 后端 GHCR 镜像：`ghcr.io/<owner>/taskbridge:<version>`
- 后端 GHCR 镜像：`ghcr.io/<owner>/taskbridge:latest`
- 后端 Docker Hub 镜像：`27xk/taskbridge:<version>`
- 后端 Docker Hub 镜像：`27xk/taskbridge:latest`

`latest` 默认会在标签发布时生成。手动触发时可以通过 `publish_latest` 控制是否发布 `latest` 标签。

## 触发发布

通过标签发布：

```bash
git tag v0.1.3
git push origin v0.1.3
```

手动发布：

1. 打开 GitHub Actions。
2. 选择 `TaskBridge Release`。
3. 点击 `Run workflow`。
4. 输入版本号，例如 `v0.1.3`。
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

如果没有配置这些 Secrets，工作流仍会使用 debug signing 生成可安装 APK。该方式只适合内部测试，不适合公开分发。

生成 `ANDROID_KEYSTORE_BASE64`：

```bash
base64 -w 0 release.keystore
```

PowerShell：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

## 权限

工作流使用默认 `GITHUB_TOKEN` 发布 GitHub Release 和 GHCR 镜像，不需要额外个人访问令牌。

需要的 workflow 权限：

- `contents: write`：创建或更新 GitHub Release。
- `packages: write`：推送 Docker 镜像到 GitHub Container Registry。

Docker Hub 使用 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` 登录。建议使用 Docker Hub Access Token，不要使用账号密码。

## 常见失败点

### Android 构建失败

检查：

- JDK 是否为 17。
- `gradlew` 是否有执行权限。
- 是否关闭了国内镜像：`-PTASKBRIDGE_USE_CHINA_MIRRORS=false`。
- release 签名 Secrets 是否完整。

### 桌面端打包失败

`electron-builder` 需要下载 Electron 运行时。发布工作流已设置：

```text
CSC_IDENTITY_AUTO_DISCOVERY=false
ELECTRON_CACHE=<workspace>/.cache/electron
ELECTRON_BUILDER_CACHE=<workspace>/.cache/electron-builder
```

这样可以避免系统缓存目录权限问题。

### Docker 发布失败

检查：

- GitHub Actions 是否有 `packages: write` 权限。
- `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` 是否已配置。
- Docker Hub 仓库命名空间是否存在且账号有推送权限。
- GHCR 包名是否为小写。
- `backend/Dockerfile` 是否能在仓库根目录上下文中构建。

### Release 没有产物

发布工作流会在上传前列出 APK 和 Windows 打包目录。若失败，请先查看对应 job 的 `Prepare artifact` 步骤日志。

如果 Android、Desktop 或 Docker 任一 job 失败，最后的 `Publish GitHub Release` job 不会执行，因此 GitHub Releases 页面不会出现新版本。
