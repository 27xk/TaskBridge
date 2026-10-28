# 跨端契约

此目录保存服务端与各客户端共同验证的接口契约和测试向量。

| 文件 | 用途 |
| --- | --- |
| `openapi.taskbridge.v1.json` | FastAPI 运行时导出的 HTTP API 契约 |
| `task-timeline-fixtures.json` | 后端、Android、Windows 共用的任务时间线样本 |
| `http-wire-fixtures.json` | Pydantic、JavaScript 和 Android Gson 共用的空值、日期、布尔值及 Unicode 样本 |

在 `backend/` 运行 `python -m tools.openapi_contract --check` 检查 OpenAPI 漂移；明确变更 API 后，运行 `python -m tools.openapi_contract --write` 重新导出。

HTTP 成功响应使用 `ApiResponse[T]`，错误响应使用 `ApiError`，导出 JSON 与 CSV 分别保留各自格式。运行 `python -m tools.client_contract --write` 生成桌面网络类型，`--check` 检查生成物漂移。桌面任务 DTO 使用生成的 `TaskRead`，同步 DTO 通过继承生成类型接受类型检查；平台持久化模型仍独立维护。Android 保留现有 Gson DTO，并通过共享 JSON 样本验证序列化。

本目录不放平台持久化模型或桌面 IPC 类型。桌面内部共用类型和纯策略位于 `desktop/common/`；Android 和 Web 各自维护存储适配。
