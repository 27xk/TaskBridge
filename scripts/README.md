# 脚本目录

`scripts/` 用于放置 TaskBridge 项目的通用开发脚本，例如本地清理、构建辅助、检查脚本和发布辅助脚本。

## 当前脚本

| 文件 | 说明 |
| --- | --- |
| `clean-local.ps1` | 清理本地生成文件和缓存，支持 `-DryRun` 和 `-All` |

示例：

```powershell
# 只预览将要清理的内容
.\scripts\clean-local.ps1 -DryRun

# 清理构建缓存
.\scripts\clean-local.ps1

# 同时清理 desktop/node_modules
.\scripts\clean-local.ps1 -All
```

桌面端专用脚本位于 `desktop/scripts/`：

| 命令 | 说明 |
| --- | --- |
| `npm run check:security-config` | 检查安全敏感配置 |
| `npm run check:desktop-endpoint-config` | 检查桌面端默认后端地址注入 |
| `npm run check:task-order` | 检查任务时间线排序 |
| `npm run check:quick-add-parser` | 检查快速添加解析 |
| `npm run check:sync-push` | 检查同步推送处理 |

## 编写约定

- 脚本名称应说明具体用途。
- 脚本参数和运行方式应写入本 README 或脚本头部注释。
- 不要在脚本中写死数据库密码、JWT 密钥、服务器地址等敏感配置。
- 可重复执行的脚本应尽量保持幂等。
- 删除或移动文件前，应明确限制目标目录，避免误删工作区外文件。
