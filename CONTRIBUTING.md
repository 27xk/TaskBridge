# 贡献指南

欢迎提交 Issue 和 Pull Request。为了让问题更容易复现和合并，请尽量按下面的约定提交。

## 提交 Issue

适合提交 Issue 的情况：

- 构建失败。
- 同步异常。
- Android 或 Windows 端 UI 显示问题。
- 后端接口行为不符合预期。
- 文档缺失或说明不清。
- 新功能建议。

提交 Bug 时请提供：

- 运行平台：Windows、Android、Docker 或 GitHub Actions。
- 版本或提交哈希。
- 复现步骤。
- 期望结果。
- 实际结果。
- 相关日志或截图。

## 提交 Pull Request

提交前请至少运行与你改动相关的验证命令。

后端：

```powershell
cd backend
python -m pytest tests -q
python -m compileall -q app tests
```

桌面端：

```powershell
cd desktop
npm run typecheck
npm run build
```

Android：

```powershell
cd android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat :app:assembleDebug
```

## 分支和提交

- 一个 Pull Request 只解决一个明确问题。
- 不要把格式化、重构和功能改动混在一起。
- 不要提交本地密钥、`.env`、数据库文件、构建产物和 IDE 配置。
- 文档改动请同步检查 README、`docs/` 和对应模块 README。

## 代码风格

- 后端遵循现有 FastAPI、Service 和 Schema 分层。
- Android 遵循现有 Compose、Repository 和 ViewModel 结构。
- 桌面端遵循现有 Electron 主进程、Vue 视图和 Pinia store 结构。
- UI 调整应同时考虑 Android、Windows 主窗口、小组件和悬浮窗之间的体验差异。

