# 桌面工作流体验验收记录

日期：2026-10-10。此次修改限于桌面端与对应文档，在现有分支保留了原先未提交的工作。

## 功能结果

| 需求 | 最终行为与验证 |
| --- | --- |
| 共享草稿、连接状态 | 快速输入和详细编辑保留标题、正文及元数据；成功后清空，失败可重试。托盘、浮窗按明确状态解析，disconnected 不会命中 connected。 |
| 撤销、批量整理 | 完成、删除、改期等显示撤销，批量操作作为一组恢复。支持安排今天、指定日期、0–5 六档优先级。撤销仅还原相应字段，保留后续无关编辑。永久删除沿用确认。 |
| 快捷记录 | Ctrl+Shift+Space 与托盘只调用浮窗入口；冷启动直接聚焦，失败保留输入，成功只生成一条任务。Ctrl+F 聚焦搜索，Ctrl+Enter 保存，输入法组合中不触发。 |
| 宽屏和窗口 | 内容宽度 1280 px 起列表与右侧详情并排，详情独立滚动；切任务保护未保存编辑。主窗保存普通尺寸、坐标及最大化，浮窗保存位置，屏幕变化后保证可见。 |
| 工作现场 | 搜索、筛选、滚动位置及常用视图按账号工作区隔离保存。切页及重启恢复，本周按显示时区的周一至周日动态计算，高优先级包含 3、4、5。 |
| 外观 | 提供舒适／紧凑密度，增强标题、日期与标签字级。侧栏、工具栏、编辑器使用统一轻量材质，按渲染能力决定是否模糊。 |

## 数据与恢复边界

主进程的事务同时比较工作区、完整任务快照和队列 ID，并原子写入任务与队列。同步确认、拉取、普通修改及撤销发生读写交错时会重新计算；队列写入失败整笔回滚。规范化的创建标识覆盖快捷／详情转换、默认空字段、等价日期、清单 ID 重建与提交回复丢失，避免重复创建。

定向回归还覆盖：加载期间切页后恢复滚动、恢复后继续记录新位置、首次任务读取失败仍完成浮窗就绪握手、同值草稿通知不会阻止成功清空、撤销后不残留相反的成功提示。

## 验证

- `npm run test:unit`：225 / 225 通过。
- `npm run build`：Vue 类型检查、主进程、Preload 和 Renderer 构建通过。
- `node scripts/check-desktop-focus-visual.mjs --workflow`：真实隔离 Electron 验证通过，包含宽窄窗口、保存失败、共享草稿、页面与重启恢复、单项及批量撤销、详情切换保护、密度、浮窗冷启动和组合键。
- 推送处理、同步重试保留、同步诊断、桌面效率、体验打磨、跨端体验及桌面文档 7 项检查通过。
- 独立审查发现的两处数据竞态和两处恢复路径均已修复并复核通过。
- 设计检测发现原有逾期标记使用 3 px 侧边框，已细化到 1 px 并保持文字对齐。

全局快捷键的回调路由由自动化测试覆盖；真实悬浮窗通过同一路径的 IPC 冷启动验证。多屏及拔屏布局由窗口生命周期与状态策略测试覆盖。

## 渲染性能与默认策略

GPU 禁用最早来自提交 `038e6b22b55c349095b8ef65500db1e5c8940973`（2026-05-18，`【桌面端】测试完成，已基础可用`），与 Preload、浮窗透明性和置顶修复同时引入。提交说明及现有文档没有记录具体驱动故障，因此保持原默认兼容路径。

本机测试环境：Windows，Electron 42.5.2 / Chromium 148.0.7778.271；内容区 1424 × 961 px，DPR 1。场景为 260 项任务、侧栏和右侧详情；按 off → on → on → off 顺序采样，每轮先预热 2 × 200 ms，再滚动采样 1600 ms。

| 配置 | 效果关闭 P95 | 效果开启 P95 | 开启时超过 33.3 ms 的帧 |
| --- | --- | --- | --- |
| 初始软件渲染，直接使用 8 px 模糊 | 7.0 ms | 20.9 ms | 0.55% |
| 最终默认软件渲染，透光色层和高光 | 7.0 ms | 7.0 ms | 0% |
| 最终 GPU 试验路径，8 px 模糊 | 7.0 ms | 7.0 ms | 0% |

最终软件路径确认 `gpu_compositing=disabled_software` 且两处大面积材质的 `backdrop-filter=none`；GPU 路径确认硬件合成启用，实际样式为 `blur(8px) saturate(1.12)`。两种路径均成功恢复测量前的任务、偏好与窗口内状态。这是单机短时对照，不据此推断所有驱动的兼容性。

## 本地证据与复现

验收产物保存在忽略目录 `desktop/tmp/ux-20261010`，原始素材与本次截图分开保存：

- 宽屏列表与详情：本地 `desktop/tmp/ux-20261010/visual/desktop-workflow-detail-1440.png`。
- 窄屏设置：本地 `desktop/tmp/ux-20261010/visual/desktop-focus-800.png`。
- 软件渲染记录：本地 `desktop/tmp/ux-20261010/visual/desktop-glass-software.json`。
- GPU 渲染记录：本地 `desktop/tmp/ux-20261010/visual/desktop-glass-gpu.json`。

```powershell
cd desktop
npm run test:unit
npm run build
$env:TASKBRIDGE_VISUAL_OUTPUT = "$PWD/tmp/ux-20261010/visual"
$env:TASKBRIDGE_ENABLE_GPU = "0"
node scripts/check-desktop-focus-visual.mjs --workflow
node scripts/check-desktop-focus-visual.mjs --benchmark
$env:TASKBRIDGE_ENABLE_GPU = "1"
node scripts/check-desktop-focus-visual.mjs --benchmark
```
