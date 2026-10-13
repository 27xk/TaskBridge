# 跨端修复、性能复测与空间清理验收

2026-10-13 收尾。对应 [审查修复计划](../plans/2026-10-10-review-remediation.md)。跨端回归、同版本产物、性能复测和四项获准清理均已完成。验收阶段保留原工作区和未提交改动，未执行发布；后续提交与推送按用户追加要求另行分组。

完整原始日志、截图、失败记录、源码差异和机器可读结果位于 `desktop/tmp/remediation-20261010/final-20261012/`。目录名称沿用开始验收的日期，最终性能和清理记录日期为 2026-10-13。原始产物保存在本地忽略目录，不随仓库分发；下文保留路径用于维护者复查，克隆仓库后可按复现命令重新生成。

## 本轮复核补充修复

- 桌面冲突恢复改为任务与同步队列原子提交，绑定原工作区并拒绝陈旧确认。提交已经成功时，列表刷新失败不再误报保存失败。
- Android 编辑在事务中保留最新服务端 ID、版本和同步时间；旧编辑不能复活随后软删除或永久删除的任务。新建、模板实例化及显式恢复保持原有行为。
- Android 小组件查询投影补回已有的 `listType`，修复无日期但显式归入“今日”的合法任务漏显，无数据库结构变更。
- Windows 打包取消通用 `node_modules/**/src/**` 排除，避免删除 `debug/src/index.js` 等生产运行代码。继续排除 TypeScript、原生源码、测试和 `better-sqlite3` 的开发目录。动态检查覆盖 176 个实际启动依赖文件。
- 旧配置检查改为核对实际分页和统一同步入口，不再要求已移除的 5,000 条总量上限或分步冲突写入方式。

上述故障均保留修复前失败与修复后通过的证据。桌面、Android 事务及小组件修复经过独立复核。

## 跨端验证

| 范围 | 最终结果 |
| --- | --- |
| 桌面单元测试 | 251 / 251，0 失败、0 跳过 |
| 桌面构建与配置 | Vue 类型检查、Electron/Vite 构建通过；38 / 38 非视觉配置检查通过 |
| 真实 Electron 工作流 | 宽窄窗口、详情、草稿、失败恢复、撤销、快捷输入、浮窗和设置验证通过 |
| Web | 167 / 167；客户端、离线核心、HTTP smoke 和语法检查通过 |
| 独立 Chromium | 36 项完整流程、20 项交错边界通过；宽屏和 390 px 窄屏、草稿、菜单、深色样式及离线重载覆盖，无页面异常 |
| 后端 | 146 / 146；Ruff 通过；容量为 1 的真实 QueuePool 验证 WebSocket 在线时数据库连接可复用，拒绝和异常路径释放资源 |
| Android | 191 / 191 JVM、19 / 19 API 35 设备测试；另 1 项独占 PSS 采样测试通过；Debug、测试 APK 和 Release 构建通过 |

Web 深色主按钮普通与悬停状态对比度分别为 8.36:1、6.25:1。Android 覆盖 5,001 条搜索与分页、260 条三页可达、容器复用、完整正文/清单、提醒、小组件和同步交错。

测试在 2026-10-12 完成。13 日继续时核实 Android 133 个源码文件及 APK 哈希未变；桌面历史保存的 4 个源/测试文件、全部 5 个构建文件哈希未变，其余业务文件无最终构建后的修改时间。桌面这部分时间元数据核查不等同于历史全树哈希。

## 桌面性能复测

Windows 11、i5-11500T、Electron 42.5.2 / Chromium 148.0.7778.271，内容区 1424 × 961 px、DPR 1。构建和模拟器均结束后串行运行，使用隔离数据库及同结构合成任务。

| 任务数 | 挂载任务行 | 页面元素 | 加载及布局 | 无变化刷新 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 11 | 375 | 33.3 ms | 1.2 ms |
| 1,000 | 14 | 437 | 119.5 ms | 1.7 ms |
| 2,500 | 14 | 437 | 298.6 ms | 1.6 ms |

最终表中所有计时样本均为 `visibility=visible`，末项均可通过键盘到达。260 条今日任务在数据库、今日查询、主存储与汇总中均为 260，冲突的两种操作均产生正确状态。旧审查中 2,500 条任务产生 64,727 个元素，本轮为 437；任务仍完整可达。首次复测有一项后台刷新样本，另存 `resources-partly-hidden.json`，未用于上表，也未转换成前台帧率。

浮窗隐藏约 60.45 秒后释放渲染进程，进程组私有提交由 183.75 MiB 降至 133.75 MiB；重新打开后草稿恢复。这里统计 Windows 私有提交，不等同于实际驻留 RAM。主窗关闭到托盘的独立内存变化未测量。

玻璃效果按 off → on → on → off 采样，每轮预热 2 × 200 ms、滚动 1,600 ms，采样前后核对原生窗口可见性，结束后恢复任务和偏好：

| 渲染方式 | 效果关闭 P95 | 效果开启 P95 | 超过 33.3 ms 的采样帧 |
| --- | ---: | ---: | ---: |
| 默认软件渲染 | 10.70 ms | 13.90 ms | 0 |
| GPU 试验路径 | 14.00 ms | 14.76 ms | 0 |

软件路径实际 `backdrop-filter=none`，GPU 路径为 `blur(8px) saturate(1.12)`。这是本机短时帧间隔对照，未改变默认软件兼容策略，不外推所有驱动或长期性能。

日期排序使用保存的原始源码与最终源码交错运行，各取 3 次中位数，并逐轮验证顺序一致：1,000 条由 390.83 ms 降至 46.22 ms；2,500 条由 972.24 ms 降至 61.02 ms。这是 Node 23.3.0 排序微基准，不代表整个应用同比提速。

## Android 内存与同版本产物

Android PSS 为 98,003 KiB（95.71 MiB），来自 API 35 / x86_64 / host GPU 模拟器的 Debug＋instrumentation 单样本：260 条合成今日任务、第一页 100 条、界面空闲后采样。原始 JSON 和截图已归档；不能外推 Release、真机内存、帧率或耗电。

| 0.1.8 产物 | 体积 | 验证 |
| --- | ---: | --- |
| Android unsigned Release | 4,166,324 bytes（3.97 MiB） | R8 / 资源压缩；构建与归档副本哈希一致 |
| Windows x64 unpacked | 327,079,705 bytes（311.93 MiB） | 80 个文件；包内 5 个构建文件与当前 `out` 的 SHA-256 一致 |

Windows 体积包括运行时与资源 321,819,777 bytes、中英语言包 1,149,315 bytes、业务 ASAR 1,933,087 bytes、解包原生模块 2,177,526 bytes。Android 的 DEX、资源及原生库分解见 `android-verify-apk-breakdown.json`。没有以旧 0.1.7 Release 和新 Debug 比较瘦身比例。

真实 Windows EXE 已验证能打开登录页、使用 Preload 桥和本地数据库。该 unpacked 包未签名、未嵌入发行服务器地址，是体积和启动验收基线；启动的注册状态探测存在已明确记录的空地址 `ERR_INVALID_URL`，不作为已配置服务的登录验收。正式发行仍需配置构建端点；完整登录后工作流由另一个隔离 fixture 验证。修复前的缺依赖错误框、Inspector 栈及失败 ASAR 均保留。

## 空间清理

删除前确认没有测试模拟器、构建或相关验收进程占用，验证每个目标严格位于工作区并拒绝重解析点；缓存 ZIP 的 24 项内容与已安装系统镜像逐项 SHA-256 相同。先预览，再使用 PowerShell `Remove-Item -LiteralPath` 执行。

| 已删除目标 | 删除前分配量 |
| --- | ---: |
| `TaskBridgeGlass30.avd/snapshots/default_boot` | 2,147,549,184 bytes |
| `TaskBridgeGlass35.avd/snapshots/default_boot` | 2,147,549,184 bytes |
| `android/.gradle/glass-avds/android35.zip` | 782,404,023 bytes |
| `desktop/tmp/review-20261010/storage/package` | 327,053,858 bytes |

合计 **5,404,556,249 bytes（5.033 GiB）**；同次删除期间 F 盘可用空间增加约 5.034 GiB。没有把稀疏用户数据镜像的逻辑大小当成回收空间。

9 个保留文件（用户数据镜像、AVD 配置、原始源码归档与补丁）前后大小和修改时间一致，小文件哈希一致。用户数据大镜像未做逐字节哈希。所有四个删除目标均复核不存在；源码、用户数据镜像和审查证据保留。

## 证据与复现

- 本地报告：桌面 `desktop-verify-report.md`、打包过滤 `desktop-verify-package-runtime-fix.md`、Android `android-verify-final-report.md`、Web / 后端 `web-backend-verify-report.md`，均位于上述本地验收目录。
- 性能：`resources-after.json`、`visual/desktop-glass-software.json`、`visual/desktop-glass-gpu.json`、`sort-comparison.json`。
- 产物：`windows-package-breakdown.json`、`windows-package-build-integrity.json`、`windows-package-startup.json`、`android-verify-apk-breakdown.json`。
- 清理：`cleanup-preview.json`、`cleanup-result.json`、`android-archive-proof.json`、`cleanup-preserved-before.json`、`cleanup-preserved-after.json`。
- 完整核对：`closeout-summary.json`、`changes.json` 和各平台差异补丁。相关日志同时保留失败和最终通过的运行，不混淆两者。

```powershell
cd desktop
npm run test:unit
npm run build
$env:TASKBRIDGE_VISUAL_OUTPUT = "$PWD/tmp/remediation-20261010/final-20261012/visual"
$env:TASKBRIDGE_ENABLE_GPU = "0"
node scripts/check-desktop-focus-visual.mjs --workflow
node scripts/check-desktop-focus-visual.mjs --benchmark
$env:TASKBRIDGE_ENABLE_GPU = "1"
node scripts/check-desktop-focus-visual.mjs --benchmark
$env:TASKBRIDGE_ENABLE_GPU = "0"
node tmp/remediation-20261010/final-20261012/resource-harness.mjs --resources
node tmp/remediation-20261010/final-20261012/sort-comparison.mjs
```

浏览器窄屏是 Chromium 视口模拟。后端本轮使用预装 Python 3.12.4 / pytest 8.3.4，项目开发依赖声明为 pytest 9.x；未调整环境。后端连接池测试使用 SQLite，未开展生产数据库压测或真实远程账号联调。以上限制不包含在本次已完成检查的结论中。
