export type AppLanguage = "zh-CN" | "en-US";

type MessageKey =
  | "app.reminder"
  | "auth.subtitle"
  | "auth.mode"
  | "auth.login"
  | "auth.register"
  | "auth.username"
  | "auth.usernameOrEmail"
  | "auth.email"
  | "auth.password"
  | "auth.processing"
  | "auth.createAccount"
  | "auth.loginFailed"
  | "auth.registerFailed"
  | "nav.label"
  | "nav.today"
  | "nav.all"
  | "nav.settings"
  | "nav.logout"
  | "task.add"
  | "task.addToday"
  | "task.edit"
  | "task.save"
  | "task.cancel"
  | "task.close"
  | "task.delete"
  | "task.editAction"
  | "task.complete"
  | "task.restore"
  | "task.today"
  | "task.tomorrow"
  | "task.snooze"
  | "task.next"
  | "task.use"
  | "task.moreActions"
  | "task.title"
  | "task.content"
  | "task.priority"
  | "task.tag"
  | "task.due"
  | "task.plan"
  | "task.reminder"
  | "task.repeat"
  | "task.template"
  | "task.project"
  | "task.list"
  | "task.checklist"
  | "task.noDue"
  | "task.search"
  | "task.empty"
  | "task.emptyToday"
  | "task.allTitle"
  | "task.todayTitle"
  | "task.todayCountSuffix"
  | "task.todayOverview"
  | "task.overdueCountSuffix"
  | "task.upcomingToday"
  | "task.openCountSuffix"
  | "task.completedCountPrefix"
  | "task.inbox"
  | "task.filterOpen"
  | "task.filterOverdue"
  | "task.filterWeek"
  | "task.filterHigh"
  | "task.filterPending"
  | "task.statusFilters"
  | "task.allProjects"
  | "task.allTags"
  | "task.templateName"
  | "task.checklistPlaceholder"
  | "task.quickPlaceholder"
  | "task.autoFillHint"
  | "task.moreSettings"
  | "task.hideSettings"
  | "task.saveTemplate"
  | "task.feedbackSaved"
  | "task.feedbackCompleted"
  | "task.feedbackRestored"
  | "task.feedbackBatchCompleted"
  | "sync.synced"
  | "sync.syncing"
  | "sync.offline"
  | "sync.error"
  | "sync.manual"
  | "sync.pendingCreate"
  | "sync.pendingUpdate"
  | "sync.pendingDelete"
  | "sync.conflict"
  | "sync.conflictExists"
  | "sync.useCloud"
  | "sync.overwriteCloud"
  | "settings.title"
  | "settings.subtitle"
  | "settings.save"
  | "settings.language"
  | "settings.languageZh"
  | "settings.languageEn"
  | "settings.deviceId"
  | "settings.lastSyncTime"
  | "settings.autoStart"
  | "settings.floatingVisibleOnStart"
  | "settings.floatingMiniMode"
  | "settings.floatingOpacity"
  | "settings.displayTimeZone"
  | "settings.displayTimeZoneHint"
  | "settings.accountDisplay"
  | "settings.dataSession"
  | "settings.general"
  | "settings.window"
  | "settings.backup"
  | "settings.metadata"
  | "settings.exportBackup"
  | "settings.importBackup"
  | "settings.projectFrom"
  | "settings.projectTo"
  | "settings.tagFrom"
  | "settings.tagTo"
  | "settings.renameProject"
  | "settings.renameTag"
  | "settings.saved"
  | "settings.exportCanceled"
  | "settings.exported"
  | "settings.importCanceled"
  | "settings.imported"
  | "settings.importedSuffix"
  | "settings.projectRenamed"
  | "settings.tagRenamed"
  | "floating.todayTasks"
  | "floating.todayList"
  | "floating.loginRequired"
  | "floating.noToday"
  | "floating.openMain"
  | "floating.miniMode"
  | "floating.hide"
  | "floating.opacity"
  | "floating.addTask"
  | "floating.refresh"
  | "floating.resize"
  | "floating.feedbackAdded"
  | "floating.feedbackCompleted"
  | "floating.placeholder";

const messages: Record<MessageKey, Record<AppLanguage, string>> = {
  "app.reminder": { "zh-CN": "TaskBridge 提醒", "en-US": "TaskBridge reminder" },
  "auth.subtitle": { "zh-CN": "Windows 桌面同步客户端", "en-US": "Windows desktop sync client" },
  "auth.mode": { "zh-CN": "认证模式", "en-US": "Authentication mode" },
  "auth.login": { "zh-CN": "登录", "en-US": "Log in" },
  "auth.register": { "zh-CN": "注册", "en-US": "Register" },
  "auth.username": { "zh-CN": "用户名", "en-US": "Username" },
  "auth.usernameOrEmail": { "zh-CN": "用户名或邮箱", "en-US": "Username or email" },
  "auth.email": { "zh-CN": "邮箱", "en-US": "Email" },
  "auth.password": { "zh-CN": "密码", "en-US": "Password" },
  "auth.processing": { "zh-CN": "处理中...", "en-US": "Working..." },
  "auth.createAccount": { "zh-CN": "创建账号", "en-US": "Create account" },
  "auth.loginFailed": { "zh-CN": "登录失败", "en-US": "Login failed" },
  "auth.registerFailed": { "zh-CN": "注册失败", "en-US": "Registration failed" },
  "nav.label": { "zh-CN": "TaskBridge 导航", "en-US": "TaskBridge navigation" },
  "nav.today": { "zh-CN": "今日", "en-US": "Today" },
  "nav.all": { "zh-CN": "全部", "en-US": "All" },
  "nav.settings": { "zh-CN": "设置", "en-US": "Settings" },
  "nav.logout": { "zh-CN": "退出登录", "en-US": "Log out" },
  "task.add": { "zh-CN": "添加待办", "en-US": "Add task" },
  "task.addToday": { "zh-CN": "添加今日待办", "en-US": "Add today" },
  "task.edit": { "zh-CN": "编辑待办", "en-US": "Edit task" },
  "task.save": { "zh-CN": "保存", "en-US": "Save" },
  "task.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "task.close": { "zh-CN": "关闭", "en-US": "Close" },
  "task.delete": { "zh-CN": "删除", "en-US": "Delete" },
  "task.editAction": { "zh-CN": "编辑", "en-US": "Edit" },
  "task.complete": { "zh-CN": "完成", "en-US": "Complete" },
  "task.restore": { "zh-CN": "恢复", "en-US": "Restore" },
  "task.today": { "zh-CN": "今日", "en-US": "Today" },
  "task.tomorrow": { "zh-CN": "明天", "en-US": "Tomorrow" },
  "task.snooze": { "zh-CN": "稍后", "en-US": "Snooze" },
  "task.next": { "zh-CN": "下一次", "en-US": "Next" },
  "task.use": { "zh-CN": "使用", "en-US": "Use" },
  "task.moreActions": { "zh-CN": "更多", "en-US": "More" },
  "task.title": { "zh-CN": "标题", "en-US": "Title" },
  "task.content": { "zh-CN": "内容", "en-US": "Content" },
  "task.priority": { "zh-CN": "优先级", "en-US": "Priority" },
  "task.tag": { "zh-CN": "标签", "en-US": "Tag" },
  "task.due": { "zh-CN": "截止", "en-US": "Due" },
  "task.plan": { "zh-CN": "计划", "en-US": "Plan" },
  "task.reminder": { "zh-CN": "提醒", "en-US": "Reminder" },
  "task.repeat": { "zh-CN": "重复", "en-US": "Repeat" },
  "task.template": { "zh-CN": "模板", "en-US": "Template" },
  "task.project": { "zh-CN": "项目", "en-US": "Project" },
  "task.list": { "zh-CN": "清单", "en-US": "List" },
  "task.checklist": { "zh-CN": "子清单", "en-US": "Checklist" },
  "task.noDue": { "zh-CN": "无截止时间", "en-US": "No due time" },
  "task.search": { "zh-CN": "搜索标题、内容、标签或项目", "en-US": "Search title, content, tag or project" },
  "task.empty": { "zh-CN": "当前视图暂无待办。", "en-US": "No tasks in this view." },
  "task.emptyToday": { "zh-CN": "今天暂无待办。", "en-US": "No tasks due today." },
  "task.allTitle": { "zh-CN": "全部待办", "en-US": "All tasks" },
  "task.todayTitle": { "zh-CN": "今日待办", "en-US": "Today" },
  "task.todayCountSuffix": { "zh-CN": "条今日待办", "en-US": "tasks today" },
  "task.todayOverview": { "zh-CN": "今日概览", "en-US": "Today overview" },
  "task.overdueCountSuffix": { "zh-CN": "条逾期", "en-US": "overdue" },
  "task.upcomingToday": { "zh-CN": "稍后处理", "en-US": "Upcoming" },
  "task.openCountSuffix": { "zh-CN": "条待办", "en-US": "open tasks" },
  "task.completedCountPrefix": { "zh-CN": "已完成", "en-US": "Completed" },
  "task.inbox": { "zh-CN": "收件箱", "en-US": "Inbox" },
  "task.filterOpen": { "zh-CN": "未完成", "en-US": "Open" },
  "task.filterOverdue": { "zh-CN": "逾期", "en-US": "Overdue" },
  "task.filterWeek": { "zh-CN": "本周", "en-US": "This week" },
  "task.filterHigh": { "zh-CN": "高优先级", "en-US": "High priority" },
  "task.filterPending": { "zh-CN": "未同步", "en-US": "Pending sync" },
  "task.statusFilters": { "zh-CN": "待办状态筛选", "en-US": "Task status filters" },
  "task.allProjects": { "zh-CN": "全部项目", "en-US": "All projects" },
  "task.allTags": { "zh-CN": "全部标签", "en-US": "All tags" },
  "task.templateName": { "zh-CN": "模板名称", "en-US": "Template name" },
  "task.checklistPlaceholder": { "zh-CN": "每行一个清单项", "en-US": "One checklist item per line" },
  "task.quickPlaceholder": {
    "zh-CN": "例如：明天下午 3 点写周报 #工作 P3",
    "en-US": "Example: write weekly report tomorrow 3pm #work P3",
  },
  "task.autoFillHint": {
    "zh-CN": "只填标题即可保存。可输入“明天下午 3 点写周报 #工作 P3”，系统会自动识别时间、标签和优先级。",
    "en-US": "Title is enough. Try \"write weekly report tomorrow 3pm #work P3\" to auto-fill time, tag and priority.",
  },
  "task.moreSettings": { "zh-CN": "更多设置", "en-US": "More settings" },
  "task.hideSettings": { "zh-CN": "收起设置", "en-US": "Hide settings" },
  "task.saveTemplate": { "zh-CN": "保存为模板", "en-US": "Save as template" },
  "task.feedbackSaved": { "zh-CN": "已保存", "en-US": "Saved" },
  "task.feedbackCompleted": { "zh-CN": "已完成", "en-US": "Completed" },
  "task.feedbackRestored": { "zh-CN": "已恢复", "en-US": "Restored" },
  "task.feedbackBatchCompleted": { "zh-CN": "当前视图待办已完成", "en-US": "Current view completed" },
  "sync.synced": { "zh-CN": "已同步", "en-US": "Synced" },
  "sync.syncing": { "zh-CN": "同步中", "en-US": "Syncing" },
  "sync.offline": { "zh-CN": "离线", "en-US": "Offline" },
  "sync.error": { "zh-CN": "同步异常", "en-US": "Sync error" },
  "sync.manual": { "zh-CN": "立即同步", "en-US": "Sync now" },
  "sync.pendingCreate": { "zh-CN": "待创建", "en-US": "Pending create" },
  "sync.pendingUpdate": { "zh-CN": "待同步", "en-US": "Pending sync" },
  "sync.pendingDelete": { "zh-CN": "待删除", "en-US": "Pending delete" },
  "sync.conflict": { "zh-CN": "冲突", "en-US": "Conflict" },
  "sync.conflictExists": { "zh-CN": "存在同步冲突", "en-US": "has a sync conflict" },
  "sync.useCloud": { "zh-CN": "采用云端", "en-US": "Use cloud" },
  "sync.overwriteCloud": { "zh-CN": "覆盖云端", "en-US": "Overwrite cloud" },
  "settings.title": { "zh-CN": "设置", "en-US": "Settings" },
  "settings.subtitle": { "zh-CN": "桌面端配置", "en-US": "Desktop client" },
  "settings.save": { "zh-CN": "保存", "en-US": "Save" },
  "settings.language": { "zh-CN": "界面语言", "en-US": "Language" },
  "settings.languageZh": { "zh-CN": "中文", "en-US": "Chinese" },
  "settings.languageEn": { "zh-CN": "英文", "en-US": "English" },
  "settings.deviceId": { "zh-CN": "设备 ID", "en-US": "Device ID" },
  "settings.lastSyncTime": { "zh-CN": "上次同步时间", "en-US": "Last sync time" },
  "settings.autoStart": { "zh-CN": "开机启动 TaskBridge", "en-US": "Start TaskBridge with Windows" },
  "settings.floatingVisibleOnStart": { "zh-CN": "启动后显示悬浮窗", "en-US": "Show floating window on start" },
  "settings.floatingMiniMode": { "zh-CN": "悬浮窗迷你模式", "en-US": "Floating mini mode" },
  "settings.floatingOpacity": { "zh-CN": "悬浮窗透明度", "en-US": "Floating opacity" },
  "settings.displayTimeZone": { "zh-CN": "显示时区", "en-US": "Display time zone" },
  "settings.displayTimeZoneHint": {
    "zh-CN": "任务时间按该时区显示，同步数据仍以 UTC 保存。",
    "en-US": "Task times use this time zone. Sync data remains stored as UTC.",
  },
  "settings.accountDisplay": { "zh-CN": "账号与显示", "en-US": "Account and display" },
  "settings.dataSession": { "zh-CN": "数据与会话", "en-US": "Data and session" },
  "settings.general": { "zh-CN": "基础", "en-US": "General" },
  "settings.window": { "zh-CN": "窗口", "en-US": "Window" },
  "settings.backup": { "zh-CN": "备份", "en-US": "Backup" },
  "settings.metadata": { "zh-CN": "项目与标签", "en-US": "Projects and tags" },
  "settings.exportBackup": { "zh-CN": "导出本地备份", "en-US": "Export local backup" },
  "settings.importBackup": { "zh-CN": "导入本地备份", "en-US": "Import local backup" },
  "settings.projectFrom": { "zh-CN": "项目原名", "en-US": "Current project name" },
  "settings.projectTo": { "zh-CN": "项目新名", "en-US": "New project name" },
  "settings.tagFrom": { "zh-CN": "标签原名", "en-US": "Current tag name" },
  "settings.tagTo": { "zh-CN": "标签新名", "en-US": "New tag name" },
  "settings.renameProject": { "zh-CN": "重命名项目", "en-US": "Rename project" },
  "settings.renameTag": { "zh-CN": "重命名标签", "en-US": "Rename tag" },
  "settings.saved": { "zh-CN": "设置已保存。", "en-US": "Settings saved." },
  "settings.exportCanceled": { "zh-CN": "已取消导出。", "en-US": "Export canceled." },
  "settings.exported": { "zh-CN": "已导出：", "en-US": "Exported: " },
  "settings.importCanceled": { "zh-CN": "已取消导入。", "en-US": "Import canceled." },
  "settings.imported": { "zh-CN": "已导入 ", "en-US": "Imported " },
  "settings.importedSuffix": { "zh-CN": " 条任务。", "en-US": " tasks." },
  "settings.projectRenamed": { "zh-CN": "项目已更新。", "en-US": "Project updated." },
  "settings.tagRenamed": { "zh-CN": "标签已更新。", "en-US": "Tag updated." },
  "floating.todayTasks": { "zh-CN": "项今日待办", "en-US": "tasks today" },
  "floating.todayList": { "zh-CN": "今日待办", "en-US": "Today" },
  "floating.loginRequired": { "zh-CN": "请先登录 TaskBridge", "en-US": "Please log in to TaskBridge" },
  "floating.noToday": { "zh-CN": "今天暂无待办", "en-US": "No tasks today" },
  "floating.openMain": { "zh-CN": "打开主窗口", "en-US": "Open main window" },
  "floating.miniMode": { "zh-CN": "迷你模式", "en-US": "Mini mode" },
  "floating.hide": { "zh-CN": "隐藏悬浮窗", "en-US": "Hide floating window" },
  "floating.opacity": { "zh-CN": "透明度", "en-US": "Opacity" },
  "floating.addTask": { "zh-CN": "添加待办", "en-US": "Add task" },
  "floating.refresh": { "zh-CN": "刷新", "en-US": "Refresh" },
  "floating.resize": { "zh-CN": "调整大小", "en-US": "Resize" },
  "floating.feedbackAdded": { "zh-CN": "已添加", "en-US": "Added" },
  "floating.feedbackCompleted": { "zh-CN": "已完成", "en-US": "Completed" },
  "floating.placeholder": {
    "zh-CN": "例如：明天下午 3 点写周报 #工作 P3",
    "en-US": "Example: write weekly report tomorrow 3pm #work P3",
  },
};

export function normalizeLanguage(value: unknown): AppLanguage {
  return value === "en-US" ? "en-US" : "zh-CN";
}

export function translate(key: MessageKey, language: AppLanguage): string {
  return messages[key][language] ?? messages[key]["zh-CN"];
}

export function translateSyncMessage(message: string, language: AppLanguage): string {
  const normalized: Record<string, MessageKey> = {
    已同步: "sync.synced",
    同步中: "sync.syncing",
    离线: "sync.offline",
    同步异常: "sync.error",
    Synced: "sync.synced",
    Syncing: "sync.syncing",
    Offline: "sync.offline",
    "Sync error": "sync.error",
    "请登录 TaskBridge": "floating.loginRequired",
  };
  const key = normalized[message];
  return key ? translate(key, language) : message;
}
