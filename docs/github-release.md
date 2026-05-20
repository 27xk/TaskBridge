# GitHub Release Pipeline

TaskBridge uses two GitHub Actions workflows:

- `.github/workflows/ci.yml` validates pull requests and pushes to `main` or `master`.
- `.github/workflows/release.yml` publishes distributable artifacts when a `v*` tag is pushed or when the workflow is started manually.

## Release Outputs

The release workflow produces:

- Android APK: `TaskBridge-<version>-android.apk`
- Windows desktop installer: `TaskBridge-<version>-Setup.exe`
- Backend Docker image: `ghcr.io/<owner>/taskbridge-backend:<version>` and `latest`

## Trigger A Release

Tag based release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Manual release:

1. Open GitHub Actions.
2. Select `TaskBridge Release`.
3. Run the workflow and enter a version such as `v0.1.0`.

## Optional Android Signing Secrets

If these repository secrets are configured, the Android APK is signed with the release key:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

If they are not configured, the workflow still produces an installable APK using the debug signing config. Use release signing before distributing outside internal testing.

Create `ANDROID_KEYSTORE_BASE64` from a keystore file:

```bash
base64 -w 0 release.keystore
```

On PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

## Required GitHub Permissions

No custom personal token is required. The workflow uses `GITHUB_TOKEN` with:

- `contents: write` to create or update GitHub Releases
- `packages: write` to publish the backend image to GitHub Container Registry
