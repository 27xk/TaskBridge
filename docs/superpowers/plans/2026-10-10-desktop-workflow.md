# 桌面工作流体验实现计划

> 按独立责任域实现并审查；用户已授权六项功能。本次在现有分支保留所有未提交改动。

**目标：** 实现共享草稿、单入口快捷记录、撤销与批量排期、宽屏详情、工作现场恢复及轻量玻璃。

**架构：** 主进程负责窗口；任务 store 负责变更与补偿撤销；父组件和工作区 store 管理草稿及视图；共享编辑器兼容抽屉和并排。

**技术栈：** Vue 3 Composition API、TypeScript、Pinia、Electron、SQLite、Node test、CDP。

- [x] 窗口与托盘：electron/{main,floating-window,shortcut,tray,state}.ts 和独立策略 helper，修复状态、录入就绪协议、多屏布局恢复。专职代理负责并验证纯策略与窗口生命周期。
- [x] 任务变更：src/stores/task.ts、shared/task-mutation-policy.ts 和必要的队列保护，实现字段撤销及批量今天/日期/优先级。验证部分失败、同步并发、账号切换。
- [x] 工作现场：src/stores/workspace.ts、shared/workspace-view-state.ts、TaskView.vue、常用视图和批量组件。持久化动态筛选组合，错误可重试。
- [x] 录入：WorkspaceQuickAdd.vue、TaskEditor.vue、TodayView.vue、QuickAddTask.vue、FloatingView.vue 和草稿 store。先验证提交前清空缺陷，接入父级草稿和组合键。
- [x] 页面整合：App.vue 管理搜索快捷键、滚动恢复及全局撤销；EditorDrawer.vue 区分并排与模态，切任务保护编辑。
- [x] 外观：settings 与显示设置增加密度和轻量效果；workspace.css 定义材质和字级，比较效果关闭/开启及受控 GPU 模式帧时间。
- [x] 验证与审查：npm run test:unit、npm run build、适用桌面检查及独立 Electron CDP 流程；审查本次增量并记录限制与实测结果。

验收结果：225 项单元测试、类型检查与构建、真实 Electron 工作流及 7 项相关检查通过。详见 [验收记录](../specs/2026-10-10-desktop-workflow-validation.md)。
