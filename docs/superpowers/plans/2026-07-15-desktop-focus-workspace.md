# TaskBridge 桌面端专注工作台实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 Windows 桌面端重构为提示克制、任务优先、编辑按需出现的专注工作台，并通过行为测试、静态守门、构建和真实视口截图验证。

**架构：** 保留现有 Pinia 状态、任务业务逻辑和 Electron IPC，以纯函数统一同步状态呈现策略。`App.vue` 只负责编排侧栏、异常横幅和一级视图；今天、全部任务、设置分别管理自己的交互状态。新增组件负责侧栏、Toast、状态横幅和快捷添加，新增独立样式表以隔离工作台布局，避免继续扩大已有 `base.css` 的重复覆盖。

**技术栈：** Vue 3 Composition API、TypeScript、Pinia、Electron、Lucide Vue Next、Node.js Test Runner、CSS Grid/Flexbox。

---

## 文件结构

### 新建

- `desktop/shared/workspace-ui-policy.ts`：同步状态优先级、指示器和异常横幅的纯函数策略。
- `desktop/tests/workspace-ui-policy.test.mjs`：同步状态策略的行为测试。
- `desktop/tests/desktop-focus-workspace.test.mjs`：新布局结构、反馈和可访问性静态契约测试。
- `desktop/src/components/AppSidebar.vue`：一级导航、账户菜单和紧凑同步入口。
- `desktop/src/components/WorkspaceStatusBanner.vue`：仅在离线或同步异常时显示的单行提示。
- `desktop/src/components/AppToast.vue`：成功操作的固定位置礼貌播报区。
- `desktop/src/components/WorkspaceQuickAdd.vue`：今天页面的单行快捷添加。
- `desktop/src/components/settings/SettingsSyncRecoveryPanel.vue`：同步诊断、重试和支持工具。
- `desktop/src/assets/workspace.css`：专注工作台布局、组件状态和响应式样式。

### 修改

- `desktop/package.json`、`desktop/package-lock.json`：加入 `lucide-vue-next`。
- `desktop/src/main.ts`：在基础样式后加载工作台样式。
- `desktop/src/App.vue`：改用新侧栏和聚合状态横幅。
- `desktop/src/i18n.ts`：加入账户菜单、异常横幅、快捷添加和设置分类文案。
- `desktop/src/views/TodayView.vue`：加入快捷添加、局部保存错误和 Toast，移除页面级同步健康卡片。
- `desktop/src/views/TaskView.vue`：重排搜索与筛选、精简有效筛选、加入局部保存错误和 Toast。
- `desktop/src/views/SettingsView.vue`：改为分类导航和单一内容区。
- `desktop/src/components/TaskItem.vue`：收紧任务行信息层级，使用图标化更多操作入口。
- `desktop/tests/ux-remediation.test.mjs`：更新桌面端同步提示与设置导航契约。
- `desktop/scripts/check-ux-priority-polish.mjs`：守门逻辑改为验证聚合异常横幅。
- `desktop/scripts/check-user-experience-optimizations.mjs`：守门逻辑改为验证新工作台组件和正常状态静默规则。

### 删除

- `desktop/src/components/SyncStatus.vue`：由侧栏聚合状态入口替代。
- `desktop/src/components/TaskSyncHealthBar.vue`：由应用级异常横幅替代，避免同一问题重复显示。

## 任务 1：用纯函数锁定同步状态呈现规则

**文件：**
- 创建：`desktop/shared/workspace-ui-policy.ts`
- 创建：`desktop/tests/workspace-ui-policy.test.mjs`

- [ ] **步骤 1：编写失败的同步状态策略测试**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const { deriveWorkspaceStatus } = await loadTsModule("shared/workspace-ui-policy.ts");
const healthy = {
  pendingQueueCount: 0,
  exhaustedQueueCount: 0,
  failedCount: 0,
  conflictCount: 0,
};

test("healthy and syncing states stay out of the main workspace", () => {
  assert.deepEqual(deriveWorkspaceStatus("synced", healthy), {
    indicator: "ready",
    banner: "none",
    issueCount: 0,
  });
  assert.equal(deriveWorkspaceStatus("syncing", healthy).banner, "none");
});

test("offline and actionable failures receive one banner", () => {
  assert.equal(deriveWorkspaceStatus("offline", healthy).banner, "offline");
  assert.deepEqual(
    deriveWorkspaceStatus("synced", { ...healthy, failedCount: 1, conflictCount: 2 }),
    { indicator: "attention", banner: "attention", issueCount: 3 },
  );
});
```

- [ ] **步骤 2：运行测试并确认因模块缺失而失败**

运行：`node --test --test-name-pattern="workspace status" desktop/tests/workspace-ui-policy.test.mjs`

预期：FAIL，错误包含 `workspace-ui-policy.ts` 不存在。

- [ ] **步骤 3：实现最小同步状态策略**

```typescript
export type WorkspaceSyncStatus = "idle" | "syncing" | "offline" | "error" | "synced";
export type WorkspaceIndicator = "ready" | "working" | "offline" | "attention";
export type WorkspaceBanner = "none" | "offline" | "attention";

export interface WorkspaceDiagnosticsSummary {
  pendingQueueCount: number;
  exhaustedQueueCount: number;
  failedCount: number;
  conflictCount: number;
}

export interface WorkspaceStatusPresentation {
  indicator: WorkspaceIndicator;
  banner: WorkspaceBanner;
  issueCount: number;
}

export function deriveWorkspaceStatus(
  status: WorkspaceSyncStatus,
  diagnostics: WorkspaceDiagnosticsSummary,
): WorkspaceStatusPresentation {
  const issueCount = diagnostics.exhaustedQueueCount + diagnostics.failedCount + diagnostics.conflictCount;
  if (status === "error" || issueCount > 0) {
    return { indicator: "attention", banner: "attention", issueCount };
  }
  if (status === "offline") {
    return { indicator: "offline", banner: "offline", issueCount: diagnostics.pendingQueueCount };
  }
  if (status === "syncing") {
    return { indicator: "working", banner: "none", issueCount: 0 };
  }
  return { indicator: "ready", banner: "none", issueCount: 0 };
}
```

- [ ] **步骤 4：运行策略测试并确认通过**

运行：`node --test --test-name-pattern="workspace status" desktop/tests/workspace-ui-policy.test.mjs`

预期：PASS，健康、同步中、离线、错误和诊断问题优先级均符合断言。

- [ ] **步骤 5：提交策略与测试**

```bash
git add desktop/shared/workspace-ui-policy.ts desktop/tests/workspace-ui-policy.test.mjs
git commit -m "test(桌面端): 锁定工作台同步状态规则"
```

## 任务 2：建立应用侧栏、异常横幅和 Toast 基础组件

**文件：**
- 修改：`desktop/package.json`
- 修改：`desktop/package-lock.json`
- 创建：`desktop/src/components/AppSidebar.vue`
- 创建：`desktop/src/components/WorkspaceStatusBanner.vue`
- 创建：`desktop/src/components/AppToast.vue`
- 修改：`desktop/src/App.vue`
- 修改：`desktop/src/i18n.ts`
- 创建：`desktop/tests/desktop-focus-workspace.test.mjs`
- 删除：`desktop/src/components/SyncStatus.vue`

- [ ] **步骤 1：安装图标依赖**

运行：`npm --prefix desktop install --save-dev lucide-vue-next`

预期：`desktop/package.json` 和锁文件新增同一版本的 `lucide-vue-next`，安装成功退出码为 `0`。

- [ ] **步骤 2：编写失败的应用骨架契约测试**

```javascript
test("desktop shell keeps healthy sync quiet and exposes one account menu", async () => {
  const [app, sidebar, banner, toast] = await Promise.all([
    source("desktop/src/App.vue"),
    source("desktop/src/components/AppSidebar.vue"),
    source("desktop/src/components/WorkspaceStatusBanner.vue"),
    source("desktop/src/components/AppToast.vue"),
  ]);

  assert.match(app, /deriveWorkspaceStatus/);
  assert.match(app, /<AppSidebar/);
  assert.match(app, /v-if="workspaceStatus\.banner !== 'none'"/);
  assert.doesNotMatch(app, /<SyncStatus|sidebar-sync-button/);
  assert.match(sidebar, /aria-expanded/);
  assert.match(sidebar, /role="menu"/);
  assert.match(banner, /aria-live="polite"/);
  assert.match(toast, /role="status"/);
});
```

- [ ] **步骤 3：运行契约测试并确认失败**

运行：`node --test desktop/tests/desktop-focus-workspace.test.mjs`

预期：FAIL，错误指出新组件文件不存在。

- [ ] **步骤 4：实现侧栏和状态组件接口**

`AppSidebar.vue` 使用以下稳定接口：

```typescript
defineProps<{
  activeView: "today" | "tasks" | "settings";
  username: string;
  status: WorkspaceStatusPresentation;
  syncing: boolean;
}>();

defineEmits<{
  navigate: [view: "today" | "tasks" | "settings"];
  syncNow: [];
  openSyncDetails: [];
  logout: [];
}>();
```

`WorkspaceStatusBanner.vue` 使用以下接口：

```typescript
defineProps<{ status: WorkspaceStatusPresentation }>();
defineEmits<{ retry: []; openDetails: [] }>();
```

`AppToast.vue` 使用以下模板语义：

```vue
<Teleport to="body">
  <Transition name="toast">
    <div v-if="message" class="app-toast" role="status" aria-live="polite">
      <CircleCheck aria-hidden="true" :size="18" />
      <span>{{ message }}</span>
    </div>
  </Transition>
</Teleport>
```

- [ ] **步骤 5：重构 `App.vue` 编排**

```typescript
const workspaceStatus = computed(() =>
  deriveWorkspaceStatus(syncStore.status, syncStore.diagnostics),
);
```

```vue
<main class="app-shell focus-workspace">
  <AppSidebar
    :active-view="activeView"
    :username="auth.user?.username ?? ''"
    :status="workspaceStatus"
    :syncing="syncStore.status === 'syncing'"
    @navigate="requestViewChange"
    @sync-now="manualSync"
    @open-sync-details="openSettingsSection('sync-recovery')"
    @logout="logout"
  />
  <section class="workspace-main">
    <WorkspaceStatusBanner
      v-if="workspaceStatus.banner !== 'none'"
      :status="workspaceStatus"
      @retry="manualSync"
      @open-details="openSettingsSection('sync-recovery')"
    />
    <!-- 当前一级视图保持原有挂载与脏数据保护 -->
  </section>
</main>
```

- [ ] **步骤 6：补齐中英文文案并运行类型检查**

新增键：`nav.accountMenu`、`sync.details`、`sync.retry`、`sync.offlineWorkspace`、`sync.attentionWorkspace`、`sync.issueCount`、`task.saveFailed`、`task.quickAdd`、`task.quickAddMore`。

运行：`npm --prefix desktop run typecheck`

预期：PASS，不存在组件属性、事件或 i18n 键类型错误。

- [ ] **步骤 7：运行骨架测试并提交**

运行：`node --test desktop/tests/desktop-focus-workspace.test.mjs`

预期：PASS。

```bash
git add desktop/package.json desktop/package-lock.json desktop/src/App.vue desktop/src/i18n.ts desktop/src/components/AppSidebar.vue desktop/src/components/WorkspaceStatusBanner.vue desktop/src/components/AppToast.vue desktop/src/components/SyncStatus.vue desktop/tests/desktop-focus-workspace.test.mjs
git commit -m "feat(桌面端): 重构专注工作台应用骨架"
```

## 任务 3：重设计今天页面和快捷添加

**文件：**
- 创建：`desktop/src/components/WorkspaceQuickAdd.vue`
- 修改：`desktop/src/views/TodayView.vue`
- 修改：`desktop/tests/desktop-focus-workspace.test.mjs`

- [ ] **步骤 1：编写失败的今天页面契约测试**

```javascript
test("today view starts with quick add and keeps save failures local", async () => {
  const [today, quickAdd] = await Promise.all([
    source("desktop/src/views/TodayView.vue"),
    source("desktop/src/components/WorkspaceQuickAdd.vue"),
  ]);

  assert.match(today, /<WorkspaceQuickAdd/);
  assert.match(today, /async function quickAddTask/);
  assert.match(today, /catch \{/);
  assert.match(today, /role="alert"/);
  assert.match(today, /<AppToast/);
  assert.doesNotMatch(today, /TaskSyncHealthBar|showTaskSyncHealth/);
  assert.match(quickAdd, /@submit\.prevent="submit"/);
  assert.match(quickAdd, /@click="\$emit\('openEditor'\)"/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test --test-name-pattern="today view" desktop/tests/desktop-focus-workspace.test.mjs`

预期：FAIL，错误指出 `WorkspaceQuickAdd.vue` 不存在。

- [ ] **步骤 3：实现快捷添加组件**

```typescript
const emit = defineEmits<{ submit: [title: string]; openEditor: [] }>();
const title = ref("");

function submit(): void {
  const value = title.value.trim();
  if (!value) return;
  emit("submit", value);
  title.value = "";
}
```

组件包含一个文本输入、一个 Enter 提交入口和一个带 `SlidersHorizontal` 图标的完整编辑按钮；图标按钮同时提供 `title` 与 `aria-label`。

- [ ] **步骤 4：实现今天页面任务流和失败反馈**

```typescript
const saveError = ref("");

async function quickAddTask(title: string): Promise<void> {
  saveError.value = "";
  try {
    await taskStore.addTask({
      title,
      listType: "today",
      plannedDate: todayLocalDate(taskStore.timelineNow, settingsStore.displayTimeZone),
    });
    showNotice(settingsStore.t("task.feedbackSaved"));
  } catch {
    saveError.value = settingsStore.t("task.saveFailed");
  }
}

async function save(draft: TaskDraft): Promise<void> {
  if (isSaving.value) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    if (editingTask.value) await taskStore.updateTask(editingTask.value, draft);
    else await taskStore.addTask(draft);
    editorOpen.value = false;
    editingTask.value = null;
    setEditorDirty(false);
    showNotice(settingsStore.t("task.feedbackSaved"));
  } catch {
    saveError.value = settingsStore.t("task.saveFailed");
  } finally {
    isSaving.value = false;
  }
}
```

成功反馈改用 `<AppToast :message="notice" />`；`saveError` 在快捷输入下方或抽屉操作区使用 `role="alert"`，失败时不关闭抽屉、不清除草稿。

- [ ] **步骤 5：运行测试与类型检查**

运行：`node --test --test-name-pattern="today view" desktop/tests/desktop-focus-workspace.test.mjs`

运行：`npm --prefix desktop run typecheck`

预期：两条命令均 PASS。

- [ ] **步骤 6：提交今天页面**

```bash
git add desktop/src/views/TodayView.vue desktop/src/components/WorkspaceQuickAdd.vue desktop/tests/desktop-focus-workspace.test.mjs
git commit -m "feat(桌面端): 重设计今天任务工作区"
```

## 任务 4：重设计全部任务、筛选和任务行

**文件：**
- 修改：`desktop/src/views/TaskView.vue`
- 修改：`desktop/src/components/TaskItem.vue`
- 修改：`desktop/tests/desktop-focus-workspace.test.mjs`
- 删除：`desktop/src/components/TaskSyncHealthBar.vue`

- [ ] **步骤 1：编写失败的筛选与反馈契约测试**

```javascript
test("all tasks keeps common filters visible and moves secondary filters into menus", async () => {
  const [taskView, taskItem] = await Promise.all([
    source("desktop/src/views/TaskView.vue"),
    source("desktop/src/components/TaskItem.vue"),
  ]);

  assert.match(taskView, /class="task-command-bar"/);
  assert.match(taskView, /class="segment-control task-filter-segments"/);
  assert.match(taskView, /class="filter-menu"/);
  assert.match(taskView, /activeFilterItems/);
  assert.match(taskView, /clearActiveFilter/);
  assert.match(taskView, /role="alert"/);
  assert.match(taskView, /<AppToast/);
  assert.doesNotMatch(taskView, /TaskSyncHealthBar|currentFilters/);
  assert.match(taskItem, /<MoreHorizontal/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test --test-name-pattern="all tasks" desktop/tests/desktop-focus-workspace.test.mjs`

预期：FAIL，错误指出旧筛选结构仍存在。

- [ ] **步骤 3：实现可单独清除的有效筛选**

```typescript
type ActiveFilterKey = "filter" | "project" | "tag" | "search";

const activeFilterItems = computed<Array<{ key: ActiveFilterKey; label: string }>>(() => {
  const items: Array<{ key: ActiveFilterKey; label: string }> = [];
  if (filter.value !== "all") {
    const option = [...primaryFilterOptions.value, ...secondaryFilterOptions.value]
      .find((item) => item.value === filter.value);
    if (option) items.push({ key: "filter", label: option.label });
  }
  if (selectedProject.value) items.push({ key: "project", label: selectedProject.value });
  if (selectedTag.value) items.push({ key: "tag", label: `#${selectedTag.value}` });
  if (search.value.trim()) items.push({ key: "search", label: search.value.trim() });
  return items;
});

function clearActiveFilter(key: ActiveFilterKey): void {
  if (key === "filter") filter.value = "all";
  if (key === "project") selectedProject.value = "";
  if (key === "tag") selectedTag.value = "";
  if (key === "search") search.value = "";
  clearSelectedTasks();
}
```

- [ ] **步骤 4：重排搜索、常用筛选和更多菜单**

工具行结构固定为：搜索框、清除搜索图标、新建按钮；下一行是 4 个常用分段筛选和 1 个更多筛选菜单。项目与标签位于同一弹出面板，未选择时不展示有效筛选区。批量工具栏仍只在 `bulkActionTargets.length > 0` 时渲染。

```vue
<div class="segment-control task-filter-segments" role="group" :aria-label="settingsStore.t('task.statusFilters')">
  <button
    v-for="option in primaryFilterOptions"
    :key="option.value"
    type="button"
    :aria-pressed="filter === option.value"
    :class="{ active: filter === option.value }"
    @click="filter = option.value"
  >
    {{ option.label }}
  </button>
</div>
```

- [ ] **步骤 5：加入保存失败反馈并精简任务行操作**

复制任务 3 的保存错误语义：`catch` 后保留抽屉和草稿，错误使用 `role="alert"`，成功使用 `AppToast`。`TaskItem.vue` 的更多操作 `summary` 改为 `MoreHorizontal` 图标和屏幕阅读器文本；任务标题允许在两行内换行，行内操作只通过 CSS 在悬停和 `:focus-within` 时增强可见度。

- [ ] **步骤 6：运行测试与类型检查**

运行：`node --test --test-name-pattern="all tasks" desktop/tests/desktop-focus-workspace.test.mjs`

运行：`npm --prefix desktop run typecheck`

预期：两条命令均 PASS。

- [ ] **步骤 7：提交全部任务页面**

```bash
git add desktop/src/views/TaskView.vue desktop/src/components/TaskItem.vue desktop/src/components/TaskSyncHealthBar.vue desktop/tests/desktop-focus-workspace.test.mjs
git commit -m "feat(桌面端): 精简任务筛选与列表操作"
```

## 任务 5：将设置页改为分类导航和单一内容区

**文件：**
- 创建：`desktop/src/components/settings/SettingsSyncRecoveryPanel.vue`
- 修改：`desktop/src/views/SettingsView.vue`
- 修改：`desktop/src/i18n.ts`
- 修改：`desktop/tests/desktop-focus-workspace.test.mjs`

- [ ] **步骤 1：编写失败的设置页结构测试**

```javascript
test("settings displays one persistent category panel at a time", async () => {
  const [settings, recovery] = await Promise.all([
    source("desktop/src/views/SettingsView.vue"),
    source("desktop/src/components/settings/SettingsSyncRecoveryPanel.vue"),
  ]);

  assert.match(settings, /type SettingsSectionId/);
  assert.match(settings, /const activeSettingsSection = ref/);
  assert.match(settings, /class="settings-category-nav"/);
  assert.match(settings, /v-show="activeSettingsSection === 'connection'"/);
  assert.doesNotMatch(settings, /scrollIntoView/);
  assert.match(recovery, /settings\.syncRecoveryCenter/);
  assert.match(recovery, /settings\.diagnosticsSupportTools/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test --test-name-pattern="settings displays" desktop/tests/desktop-focus-workspace.test.mjs`

预期：FAIL，错误指出恢复面板不存在或设置页仍使用锚点滚动。

- [ ] **步骤 3：建立分类状态与外部跳转映射**

```typescript
type SettingsSectionId =
  | "account-display"
  | "account-security"
  | "connection"
  | "window"
  | "data"
  | "sync-recovery"
  | "metadata";

const activeSettingsSection = ref<SettingsSectionId>("account-display");

function showSettingsSection(sectionId: string): void {
  if (!settingsNavItems.value.some((item) => item.sectionId === sectionId)) return;
  activeSettingsSection.value = sectionId as SettingsSectionId;
  if (sectionId === "sync-recovery") syncDiagnosticsOpen.value = true;
  if (sectionId === "metadata") metadataOpen.value = false;
}
```

`sectionRequest` 监听器调用 `showSettingsSection`。分类面板使用 `v-show`，保证连接草稿在内部切换时不卸载。

- [ ] **步骤 4：提取同步恢复面板**

```typescript
defineProps<{
  deviceId: string;
  diagnostics: SyncDiagnostics;
  serverTaskMeta: TaskMetaDto | null;
  note: string;
  updateTechnicalDetail: string;
}>();

defineEmits<{
  refresh: [];
  retry: [];
  exportDiagnostics: [];
}>();
```

组件内部保留诊断折叠区、耗尽队列列表和支持工具折叠区。正常无问题时只显示简短空状态；详细计数和技术信息默认收起。

- [ ] **步骤 5：重写设置模板**

```vue
<div class="settings-workspace">
  <nav class="settings-category-nav" :aria-label="settingsStore.t('settings.title')">
    <button
      v-for="item in settingsNavItems"
      :key="item.sectionId"
      type="button"
      :class="{ active: activeSettingsSection === item.sectionId }"
      :aria-current="activeSettingsSection === item.sectionId ? 'page' : undefined"
      @click="showSettingsSection(item.sectionId)"
    >
      <component :is="item.icon" aria-hidden="true" :size="17" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
  <div class="settings-content">
    <!-- 现有设置面板按 activeSettingsSection 使用 v-show -->
  </div>
</div>
```

- [ ] **步骤 6：运行设置测试与类型检查**

运行：`node --test --test-name-pattern="settings displays" desktop/tests/desktop-focus-workspace.test.mjs`

运行：`npm --prefix desktop run typecheck`

预期：两条命令均 PASS，连接草稿事件仍可传播到 `App.vue`。

- [ ] **步骤 7：提交设置页**

```bash
git add desktop/src/views/SettingsView.vue desktop/src/components/settings/SettingsSyncRecoveryPanel.vue desktop/src/i18n.ts desktop/tests/desktop-focus-workspace.test.mjs
git commit -m "feat(桌面端): 重构设置分类工作区"
```

## 任务 6：实现完整视觉系统与响应式布局

**文件：**
- 创建：`desktop/src/assets/workspace.css`
- 修改：`desktop/src/main.ts`
- 修改：`desktop/src/assets/base.css`
- 修改：`desktop/tests/desktop-focus-workspace.test.mjs`

- [ ] **步骤 1：编写失败的响应式样式契约测试**

```javascript
test("workspace stylesheet defines stable desktop and narrow layouts", async () => {
  const [main, css] = await Promise.all([
    source("desktop/src/main.ts"),
    source("desktop/src/assets/workspace.css"),
  ]);

  assert.match(main, /assets\/workspace\.css/);
  assert.match(css, /grid-template-columns:\s*184px minmax\(0, 1fr\)/);
  assert.match(css, /max-width:\s*1080px/);
  assert.match(css, /width:\s*min\(440px/);
  assert.match(css, /@media \(max-width: 1099px\)/);
  assert.match(css, /grid-template-columns:\s*72px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 799px\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`node --test --test-name-pattern="workspace stylesheet" desktop/tests/desktop-focus-workspace.test.mjs`

预期：FAIL，错误指出 `workspace.css` 不存在。

- [ ] **步骤 3：建立工作台变量和宽屏布局**

```css
.focus-workspace {
  --workspace-sidebar: #f1f5f3;
  --workspace-canvas: #ffffff;
  --workspace-line: #dce4e0;
  --workspace-text: #17211f;
  --workspace-muted: #68756f;
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
  width: 100%;
  height: 100vh;
  min-width: 0;
  overflow: hidden;
  color: var(--workspace-text);
  background: var(--workspace-canvas);
}

.focus-workspace .view-shell {
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: 28px 40px 48px;
}

.focus-workspace .side-panel {
  width: min(440px, calc(100vw - 184px));
}
```

- [ ] **步骤 4：实现任务、菜单、Toast 和设置样式**

要求：任务行最小高度 `56 px`；主列表无外层卡片；任务行边框半径不超过 `8 px`；成功 Toast 固定在右下角；弹出菜单、抽屉和对话框使用有限阴影；图标按钮为稳定 `36 x 36 px`；所有文字容器允许换行；危险色仅用于逾期、冲突和破坏性操作。

- [ ] **步骤 5：实现窄窗口和减少动画规则**

```css
@media (max-width: 1099px) {
  .focus-workspace {
    grid-template-columns: 72px minmax(0, 1fr);
  }
  .focus-workspace .nav-label,
  .focus-workspace .brand-name,
  .focus-workspace .account-name {
    display: none;
  }
}

@media (max-width: 799px) {
  .focus-workspace {
    grid-template-columns: 64px minmax(0, 1fr);
    overflow-x: hidden;
  }
  .focus-workspace .task-command-bar,
  .focus-workspace .settings-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .focus-workspace *,
  .app-toast {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

- [ ] **步骤 6：移除 `base.css` 中已失效的常驻同步与重复工作台覆盖**

删除仅服务于旧结构的 `.sidebar-sync-button`、`.sidebar .sync-status`、`.task-sync-health-bar` 和旧设置锚点导航样式。保留登录页、悬浮窗、编辑表单、对话框和主题变量所需样式。运行 `rg` 确认被删除组件的选择器不再存在。

- [ ] **步骤 7：运行样式契约、类型检查和构建**

运行：`node --test --test-name-pattern="workspace stylesheet" desktop/tests/desktop-focus-workspace.test.mjs`

运行：`npm --prefix desktop run typecheck`

运行：`npm --prefix desktop run build`

预期：3 条命令均 PASS。

- [ ] **步骤 8：提交视觉系统**

```bash
git add desktop/src/assets/workspace.css desktop/src/assets/base.css desktop/src/main.ts desktop/tests/desktop-focus-workspace.test.mjs
git commit -m "style(桌面端): 完成专注工作台视觉与响应式布局"
```

## 任务 7：更新 UX 守门并运行桌面完整回归

**文件：**
- 修改：`desktop/tests/ux-remediation.test.mjs`
- 修改：`desktop/scripts/check-ux-priority-polish.mjs`
- 修改：`desktop/scripts/check-user-experience-optimizations.mjs`
- 修改：`desktop/tests/desktop-focus-workspace.test.mjs`

- [ ] **步骤 1：将旧健康条断言改为单一异常横幅断言**

```javascript
assert.match(desktopAppSource, /v-if="workspaceStatus\.banner !== 'none'"/);
assert.match(desktopWorkspaceBannerSource, /aria-live="polite"/);
assert.doesNotMatch(desktopTodayViewSource, /TaskSyncHealthBar|showTaskSyncHealth/);
assert.doesNotMatch(desktopTaskViewSource, /TaskSyncHealthBar|showTaskSyncHealth/);
```

守门文件读取 `WorkspaceStatusBanner.vue` 和 `workspace-ui-policy.ts`，不再读取已删除的 `TaskSyncHealthBar.vue`。

- [ ] **步骤 2：运行受影响的 UX 守门并确认通过**

运行：`npm --prefix desktop run check:ux-priority-polish`

运行：`npm --prefix desktop run check:user-experience`

运行：`npm --prefix desktop run test:unit`

预期：3 条命令均 PASS，桌面测试总数不低于改造前的 `50` 条。

- [ ] **步骤 3：运行桌面类型检查和生产构建**

运行：`npm --prefix desktop run typecheck`

运行：`npm --prefix desktop run build`

预期：两条命令均 PASS，`desktop/out` 重新生成。

- [ ] **步骤 4：运行仓库静态守门**

运行：`powershell -ExecutionPolicy Bypass -File .\scripts\check-local.ps1 -ReportOnly -SkipBackend -SkipDesktopBuild`

预期：桌面静态守门全部 PASS；仅显式跳过后端、Android 和重复桌面构建，不出现 failed 或 blocked。

- [ ] **步骤 5：提交守门更新**

```bash
git add desktop/tests/ux-remediation.test.mjs desktop/tests/desktop-focus-workspace.test.mjs desktop/scripts/check-ux-priority-polish.mjs desktop/scripts/check-user-experience-optimizations.mjs
git commit -m "test(桌面端): 更新专注工作台体验守门"
```

## 任务 8：真实视口与交互验收

**文件：**
- 创建：`docs/assets/desktop-focus-1440.png`
- 创建：`docs/assets/desktop-focus-1024.png`
- 创建：`docs/assets/desktop-focus-800.png`
- 修改：`desktop/README.md`

- [ ] **步骤 1：启动桌面开发服务**

运行：`npm --prefix desktop run dev`

预期：Electron 窗口成功启动，主进程和渲染进程控制台无未处理异常。

- [ ] **步骤 2：准备可重复验收数据**

使用现有测试账号或本地测试服务创建：1 条逾期任务、3 条今天任务、1 条长标题任务、1 条带项目和标签任务、1 条已完成任务。记录账号、服务地址和数据恢复方式，不修改真实用户数据。

- [ ] **步骤 3：检查 `1440 x 1000` 宽屏布局**

验证：`184 px` 侧栏、快捷添加首屏可见、正常同步只显示状态点、编辑抽屉不压缩列表、任务行操作悬停和键盘聚焦均可见。保存截图到 `docs/assets/desktop-focus-1440.png`。

- [ ] **步骤 4：检查 `1024 x 768` 与 `800 x 700` 窄窗口布局**

验证：侧栏分别收窄、标签不遮挡、筛选可换行、设置分类可用、抽屉覆盖内容且可关闭、页面无横向滚动。保存截图到 `docs/assets/desktop-focus-1024.png` 和 `docs/assets/desktop-focus-800.png`。

- [ ] **步骤 5：验证异常和辅助功能状态**

依次验证同步中、离线、同步失败、冲突、保存失败和未保存关闭。确认同一同步问题只出现一个横幅；保存失败保留草稿并使用 `role="alert"`；成功 Toast 使用 `role="status"`；键盘焦点进入并离开抽屉后返回触发点；启用减少动画后无明显位移动画。

- [ ] **步骤 6：检查截图像素和可访问性树**

对 3 张截图使用图像查看工具确认非空、无遮挡、无裁切。使用浏览器或 Electron DevTools 可访问性树检查所有图标按钮均有名称，且不存在空名称交互节点。

- [ ] **步骤 7：更新桌面 README 截图并提交**

在 `desktop/README.md` 的界面部分引用宽屏截图，并注明窄窗口会收为图标导航。运行 Markdown 本地链接检查后提交。

```bash
git add docs/assets/desktop-focus-1440.png docs/assets/desktop-focus-1024.png docs/assets/desktop-focus-800.png desktop/README.md
git commit -m "docs(桌面端): 更新专注工作台界面截图"
```

- [ ] **步骤 8：最终验证工作区差异**

运行：`git diff --check`

运行：`git status --short`

预期：`git diff --check` 无输出；状态列表中不包含临时日志、开发数据库、截图之外的生成物或未解释文件。
