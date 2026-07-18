export type AppLanguage = "zh-CN" | "en-US";

type MessageKey =
  | "app.reminder"
  | "auth.subtitle"
  | "auth.firstUseTitle"
  | "auth.firstUseHint"
  | "auth.firstUseExistingServer"
  | "auth.firstUseExistingServerTitle"
  | "auth.firstUseNoServer"
  | "auth.firstUseNoServerTitle"
  | "auth.openLocalTrialGuide"
  | "auth.openSelfHostGuide"
  | "auth.noServerHelpSummary"
  | "auth.noServerHelpBody"
  | "auth.copyLocalTrialReference"
  | "auth.localTrialReferenceCopied"
  | "auth.localTrialReferenceCopyFailed"
  | "auth.selfHostReferenceCopied"
  | "auth.selfHostReferenceCopyFailed"
  | "auth.mode"
  | "auth.login"
  | "auth.register"
  | "auth.registrationConnectionHint"
  | "auth.registrationUnknown"
  | "auth.registrationClosed"
  | "auth.username"
  | "auth.usernameOrEmail"
  | "auth.email"
  | "auth.password"
  | "auth.showPassword"
  | "auth.hidePassword"
  | "auth.processing"
  | "auth.createAccount"
  | "auth.loginFailed"
  | "auth.registerFailed"
  | "auth.serverUrlRequired"
  | "auth.networkError"
  | "auth.serverError"
  | "auth.sessionExpired"
  | "auth.serverChangedRelogin"
  | "auth.cachedWorkspaceTitle"
  | "auth.cachedWorkspaceSummary"
  | "auth.cachedWorkspaceEmpty"
  | "auth.continueOffline"
  | "auth.localWorkspaceTitle"
  | "auth.localWorkspaceBody"
  | "auth.loginAndSync"
  | "nav.label"
  | "nav.today"
  | "nav.all"
  | "nav.settings"
  | "nav.logout"
  | "nav.accountMenu"
  | "task.add"
  | "task.saveFailed"
  | "task.quickAdd"
  | "task.quickAddMore"
  | "task.showAllTasks"
  | "task.clearFilters"
  | "task.addToday"
  | "task.edit"
  | "task.save"
  | "task.cancel"
  | "task.close"
  | "task.discardChangesConfirm"
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
  | "task.bodyDetails"
  | "task.arrangementSettings"
  | "task.priority"
  | "task.tag"
  | "task.due"
  | "task.plan"
  | "task.reminder"
  | "task.repeat"
  | "task.template"
  | "task.trash"
  | "task.emptyTrash"
  | "task.restoreFromTrash"
  | "task.purge"
  | "task.purgeConfirm"
  | "task.restoreSelectedTrash"
  | "task.purgeSelectedTrash"
  | "task.purgeSelectedConfirm"
  | "task.project"
  | "task.list"
  | "task.checklist"
  | "task.noDue"
  | "task.search"
  | "task.clearSearch"
  | "task.currentFilters"
  | "task.syncHealthTitle"
  | "task.syncHealthReady"
  | "task.syncHealthNeedsReview"
  | "task.syncHealthUnknown"
  | "task.syncHealthDegraded"
  | "task.syncHealthAction"
  | "task.emptySearch"
  | "task.emptyFiltered"
  | "task.empty"
  | "task.emptyToday"
  | "task.allTitle"
  | "task.todayTitle"
  | "task.todayCountSuffix"
  | "task.todayOverview"
  | "task.overdueCountSuffix"
  | "task.upcomingToday"
  | "task.openCountSuffix"
  | "task.selectedCountSuffix"
  | "task.completedCountPrefix"
  | "task.inbox"
  | "task.filterOpen"
  | "task.filterOverdue"
  | "task.filterWeek"
  | "task.filterHigh"
  | "task.filterPending"
  | "task.moreFilters"
  | "task.projectTagFilters"
  | "task.statusFilters"
  | "task.allProjects"
  | "task.allTags"
  | "task.templateName"
  | "task.checklistPlaceholder"
  | "task.quickPlaceholder"
  | "task.autoFillHint"
  | "task.scheduleHelp"
  | "task.moreSettings"
  | "task.hideSettings"
  | "task.saveTemplate"
  | "task.feedbackSaved"
  | "task.feedbackCompleted"
  | "task.feedbackRestored"
  | "task.feedbackDeleted"
  | "task.feedbackPurged"
  | "task.feedbackBatchCompleted"
  | "task.feedbackBatchDeleted"
  | "task.feedbackBatchRestored"
  | "task.feedbackBatchPurged"
  | "task.completeVisible"
  | "task.completeVisibleConfirm"
  | "task.deleteVisible"
  | "task.deleteVisibleConfirm"
  | "task.bulkActions"
  | "task.enterSelectionMode"
  | "task.clearSelection"
  | "sync.synced"
  | "sync.syncing"
  | "sync.offline"
  | "sync.error"
  | "sync.manual"
  | "sync.details"
  | "sync.retry"
  | "sync.offlineWorkspace"
  | "sync.attentionWorkspace"
  | "sync.attentionWorkspaceCount"
  | "sync.pendingCreate"
  | "sync.pendingUpdate"
  | "sync.pendingDelete"
  | "sync.failed"
  | "sync.conflict"
  | "sync.conflictExists"
  | "sync.localSnapshot"
  | "sync.cloudSnapshot"
  | "sync.cloudSnapshotMissing"
  | "sync.conflictFields"
  | "sync.conflictNoFieldDiff"
  | "sync.useServer"
  | "sync.overwriteServer"
  | "sync.useCloud"
  | "sync.overwriteCloud"
  | "sync.conflictHelp"
  | "sync.useCloudConfirm"
  | "sync.overwriteCloudConfirm"
  | "sync.logoutPendingWarning"
  | "settings.title"
  | "settings.subtitle"
  | "settings.navCommon"
  | "settings.navDataSafety"
  | "settings.navSyncRecovery"
  | "settings.navAdvancedMaintenance"
  | "settings.save"
  | "settings.saveDisplayPreferences"
  | "settings.saveHint"
  | "settings.autoSaved"
  | "settings.autoSaveHint"
  | "settings.language"
  | "settings.languageZh"
  | "settings.languageEn"
  | "settings.desktopTheme"
  | "settings.desktopThemeHint"
  | "settings.connection"
  | "settings.serverUrl"
  | "settings.serverUrlHint"
  | "settings.applyServerUrl"
  | "settings.saveConnection"
  | "settings.checkAndSaveConnection"
  | "settings.checkAndSaveAdvancedConnection"
  | "settings.testConnection"
  | "settings.connectionTesting"
  | "settings.loginAutoChecksConnection"
  | "settings.connectionSaved"
  | "settings.apiConnectionReady"
  | "settings.connectionReady"
  | "settings.connectionFailed"
  | "settings.discardConnectionChangesConfirm"
  | "settings.serverUrlRequired"
  | "settings.localhostHint"
  | "settings.showAdvancedConnection"
  | "settings.advancedEndpoints"
  | "settings.resetGeneratedEndpoints"
  | "settings.baseUrl"
  | "settings.wsUrl"
  | "settings.baseUrlHint"
  | "settings.wsUrlHint"
  | "settings.deviceId"
  | "settings.lastSyncTime"
  | "settings.syncAtAGlance"
  | "settings.syncLooksGood"
  | "settings.syncNeedsAttention"
  | "settings.syncNextStep"
  | "settings.syncNextStepNone"
  | "settings.syncNextStepReview"
  | "settings.localDataTrust"
  | "settings.syncDiagnostics"
  | "settings.pendingQueueCount"
  | "settings.exhaustedQueueCount"
  | "settings.failedTaskCount"
  | "settings.conflictCount"
  | "settings.diagnosticsUpdatedAt"
  | "settings.refreshDiagnostics"
  | "settings.syncRecoveryCenter"
  | "settings.retryExhaustedQueue"
  | "settings.retryExhaustedDone"
  | "settings.noExhaustedQueueItems"
  | "settings.pendingOrFailedSyncRetryAvailable"
  | "settings.syncIssueAction"
  | "settings.syncIssueAttempts"
  | "settings.syncIssueCreatedAt"
  | "settings.exportDiagnostics"
  | "settings.diagnosticsSupportTools"
  | "settings.diagnosticsSensitiveHint"
  | "settings.confirmDiagnosticsExport"
  | "settings.diagnosticsExported"
  | "settings.diagnosticsExportCanceled"
  | "settings.updateStatus"
  | "settings.updateTechnicalDetails"
  | "settings.autoStart"
  | "settings.floatingVisibleOnStart"
  | "settings.floatingOpacity"
  | "settings.displayTimeZone"
  | "settings.displayTimeZoneHint"
  | "settings.accountDisplay"
  | "settings.accountSecurity"
  | "settings.refreshSessions"
  | "settings.changePassword"
  | "settings.currentPassword"
  | "settings.newPassword"
  | "settings.confirmNewPassword"
  | "settings.passwordMismatch"
  | "settings.passwordChanged"
  | "settings.passwordChangeFailed"
  | "settings.activeSessions"
  | "settings.sessionSecurityHint"
  | "settings.loadingSessions"
  | "settings.noActiveSessions"
  | "settings.thisDevice"
  | "settings.unknownDevice"
  | "settings.sessionCreated"
  | "settings.sessionExpires"
  | "settings.revokeSession"
  | "settings.revokeSessionConfirm"
  | "settings.sessionRevoked"
  | "settings.sessionRevokeFailed"
  | "settings.revokeOtherSessions"
  | "settings.revokeOtherSessionsConfirm"
  | "settings.otherSessionsRevoked"
  | "settings.sessionsLoadFailed"
  | "settings.serverTodayCount"
  | "settings.serverOverdueCount"
  | "settings.dataSession"
  | "settings.dataTools"
  | "settings.general"
  | "settings.window"
  | "settings.backup"
  | "settings.session"
  | "settings.updates"
  | "settings.metadata"
  | "settings.exportBackup"
  | "settings.importBackup"
  | "settings.checkUpdates"
  | "settings.clearLocalData"
  | "settings.clearLocalDataSafetyHint"
  | "settings.clearLocalDataBlocked"
  | "settings.clearLocalDataConfirm"
  | "settings.clearLocalDataConfirmMessage"
  | "settings.localDataCleared"
  | "settings.confirmBackupImport"
  | "settings.undoLastImport"
  | "settings.importUndoDone"
  | "settings.projectFrom"
  | "settings.projectTo"
  | "settings.tagFrom"
  | "settings.tagTo"
  | "settings.renameProject"
  | "settings.renameTag"
  | "settings.confirmMetadataRename"
  | "settings.saved"
  | "settings.exportCanceled"
  | "settings.exported"
  | "settings.importCanceled"
  | "settings.imported"
  | "settings.importedSuffix"
  | "settings.importFailed"
  | "settings.importSkippedPrefix"
  | "settings.importSkippedSuffix"
  | "settings.projectRenamed"
  | "settings.tagRenamed"
  | "floating.todayTasks"
  | "floating.todayList"
  | "floating.loginRequired"
  | "floating.noToday"
  | "floating.openMain"
  | "floating.openMainShort"
  | "floating.hide"
  | "floating.hideShort"
  | "floating.tools"
  | "floating.opacity"
  | "floating.addTask"
  | "floating.refresh"
  | "floating.resize"
  | "floating.feedbackAdded"
  | "floating.feedbackAddedInbox"
  | "floating.feedbackCompleted"
  | "floating.hiddenTasks"
  | "floating.placeholder";

const messages: Record<MessageKey, Record<AppLanguage, string>> = {
  "app.reminder": { "zh-CN": "TaskBridge 提醒", "en-US": "TaskBridge reminder" },
  "auth.subtitle": { "zh-CN": "跨设备待办", "en-US": "Cross-device tasks" },
  "auth.firstUseTitle": { "zh-CN": "已有服务器地址就能登录", "en-US": "Sign in with a server address" },
  "auth.firstUseHint": {
    "zh-CN": "填写 TaskBridge 服务器地址后直接登录；没有地址时，先向管理员或部署者索取。",
    "en-US": "Enter the TaskBridge server address and sign in. If you do not have one, ask your administrator or deployer first.",
  },
  "auth.firstUseExistingServer": {
    "zh-CN": "直接填写管理员给你的服务器地址，检查通过后登录或注册。",
    "en-US": "Enter the server address from your administrator, then sign in or register after the check passes.",
  },
  "auth.firstUseExistingServerTitle": { "zh-CN": "服务器地址", "en-US": "Server address" },
  "auth.firstUseNoServer": {
    "zh-CN": "如果只是使用别人部署好的 TaskBridge，请先联系管理员或部署者；自己试用或自托管时再打开准备服务说明。",
    "en-US": "If you use someone else's TaskBridge service, ask the administrator or deployer first. Open setup help only for a local trial or self-hosting.",
  },
  "auth.firstUseNoServerTitle": { "zh-CN": "没有服务器地址", "en-US": "No server address" },
  "auth.openLocalTrialGuide": { "zh-CN": "打开本机试用说明", "en-US": "Open local trial guide" },
  "auth.openSelfHostGuide": { "zh-CN": "打开自托管说明", "en-US": "Open self-hosting guide" },
  "auth.noServerHelpSummary": { "zh-CN": "没有服务器地址？查看准备服务说明", "en-US": "No server address? View setup guide" },
  "auth.noServerHelpBody": {
    "zh-CN": "普通使用只需要一个服务器地址。如果你只是使用别人部署好的 TaskBridge，请联系管理员或部署者；想先试用或长期自托管时，再按说明准备服务。",
    "en-US": "Normal use only needs one server address. If you use someone else's TaskBridge service, ask the administrator or deployer. Prepare the service only for a trial or long-term self-hosting.",
  },
  "auth.copyLocalTrialReference": { "zh-CN": "复制本机试用参考", "en-US": "Copy local trial reference" },
  "auth.localTrialReferenceCopied": { "zh-CN": "已复制本机试用参考。", "en-US": "Copied local trial reference." },
  "auth.localTrialReferenceCopyFailed": {
    "zh-CN": "复制失败，请按上方说明准备后端，或在项目部署说明中查看更完整的自托管步骤。",
    "en-US": "Copy failed. Use the guidance above, or check the project deployment guide for full self-hosting details.",
  },
  "auth.selfHostReferenceCopied": { "zh-CN": "已复制自托管说明参考。", "en-US": "Copied self-hosting reference." },
  "auth.selfHostReferenceCopyFailed": {
    "zh-CN": "复制失败，请在项目部署说明中查看完整的自托管步骤。",
    "en-US": "Copy failed. Check the project deployment guide for full self-hosting steps.",
  },
  "auth.mode": { "zh-CN": "认证模式", "en-US": "Authentication mode" },
  "auth.login": { "zh-CN": "登录", "en-US": "Log in" },
  "auth.register": { "zh-CN": "注册", "en-US": "Register" },
  "auth.registrationConnectionHint": {
    "zh-CN": "注册状态取决于当前服务器。请先检查服务器地址；如果该服务器关闭注册，请联系管理员创建账号。",
    "en-US": "Registration depends on the current server. Check the server address first; if registration is closed, ask the administrator to create an account.",
  },
  "auth.registrationUnknown": {
    "zh-CN": "点击“注册”会自动检查当前服务器是否开放注册。已有账号可直接登录。",
    "en-US": "Click Register to check automatically whether this server allows registration. Existing accounts can sign in now.",
  },
  "auth.registrationClosed": {
    "zh-CN": "当前服务器已关闭开放注册。请使用已有账号登录，或联系服务器管理员创建账号。",
    "en-US": "Open registration is disabled on this server. Use an existing account or ask the server admin to create one.",
  },
  "auth.username": { "zh-CN": "用户名", "en-US": "Username" },
  "auth.usernameOrEmail": { "zh-CN": "用户名或邮箱", "en-US": "Username or email" },
  "auth.email": { "zh-CN": "邮箱", "en-US": "Email" },
  "auth.password": { "zh-CN": "密码", "en-US": "Password" },
  "auth.showPassword": { "zh-CN": "显示密码", "en-US": "Show password" },
  "auth.hidePassword": { "zh-CN": "隐藏密码", "en-US": "Hide password" },
  "auth.processing": { "zh-CN": "处理中...", "en-US": "Working..." },
  "auth.createAccount": { "zh-CN": "创建账号", "en-US": "Create account" },
  "auth.loginFailed": { "zh-CN": "登录失败", "en-US": "Login failed" },
  "auth.registerFailed": { "zh-CN": "注册失败", "en-US": "Registration failed" },
  "auth.serverUrlRequired": { "zh-CN": "请输入服务器地址。", "en-US": "Enter the server address." },
  "auth.networkError": {
    "zh-CN": "无法连接服务器，请检查服务器地址和网络后重试。",
    "en-US": "Cannot reach the server. Check the server URL and network, then try again.",
  },
  "auth.serverError": {
    "zh-CN": "服务器暂时无法完成请求，请稍后重试或联系管理员。",
    "en-US": "The server could not complete the request. Try again later or contact the admin.",
  },
  "auth.sessionExpired": {
    "zh-CN": "登录会话已失效，请重新登录后继续同步。",
    "en-US": "Your session expired. Sign in again to resume syncing.",
  },
  "auth.serverChangedRelogin": {
    "zh-CN": "服务器已切换，请登录新服务器。原服务器的本地任务和待同步操作仍保留在原工作区。",
    "en-US": "The server changed. Sign in to the new server. Local tasks and pending changes remain in the previous workspace.",
  },
  "auth.cachedWorkspaceTitle": { "zh-CN": "继续使用本机任务", "en-US": "Continue with local tasks" },
  "auth.cachedWorkspaceSummary": {
    "zh-CN": "这台电脑已缓存 {count} 条任务。可以继续查看和编辑，重新登录后再同步。",
    "en-US": "This computer has {count} cached tasks. Keep viewing and editing them, then sign in to sync.",
  },
  "auth.cachedWorkspaceEmpty": {
    "zh-CN": "本机工作区仍可打开。新建或修改会保存在这台电脑，重新登录后再同步。",
    "en-US": "The local workspace is still available. New changes stay on this computer until you sign in again.",
  },
  "auth.continueOffline": { "zh-CN": "进入本机工作区", "en-US": "Open local workspace" },
  "auth.localWorkspaceTitle": { "zh-CN": "本机模式", "en-US": "Local mode" },
  "auth.localWorkspaceBody": {
    "zh-CN": "任务会保存在这台电脑，但暂不会同步到其他设备。",
    "en-US": "Tasks stay on this computer and will not sync to other devices yet.",
  },
  "auth.loginAndSync": { "zh-CN": "登录并同步", "en-US": "Sign in and sync" },
  "nav.label": { "zh-CN": "TaskBridge 导航", "en-US": "TaskBridge navigation" },
  "nav.today": { "zh-CN": "今日", "en-US": "Today" },
  "nav.all": { "zh-CN": "全部", "en-US": "All" },
  "nav.settings": { "zh-CN": "设置", "en-US": "Settings" },
  "nav.logout": { "zh-CN": "退出登录", "en-US": "Log out" },
  "nav.accountMenu": { "zh-CN": "账户菜单", "en-US": "Account menu" },
  "task.add": { "zh-CN": "添加待办", "en-US": "Add task" },
  "task.saveFailed": { "zh-CN": "保存失败，请重试。", "en-US": "Could not save. Try again." },
  "task.quickAdd": { "zh-CN": "快速添加待办", "en-US": "Quick add task" },
  "task.quickAddMore": { "zh-CN": "更多", "en-US": "More" },
  "task.showAllTasks": { "zh-CN": "查看全部待办", "en-US": "Show all tasks" },
  "task.clearFilters": { "zh-CN": "清空筛选", "en-US": "Clear filters" },
  "task.addToday": { "zh-CN": "添加今日待办", "en-US": "Add today" },
  "task.edit": { "zh-CN": "编辑待办", "en-US": "Edit task" },
  "task.save": { "zh-CN": "保存", "en-US": "Save" },
  "task.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "task.close": { "zh-CN": "关闭", "en-US": "Close" },
  "task.discardChangesConfirm": {
    "zh-CN": "当前编辑内容尚未保存，关闭后会丢失这些修改。仍要关闭吗？",
    "en-US": "This task has unsaved edits. Closing now will discard them. Close anyway?",
  },
  "task.delete": { "zh-CN": "删除", "en-US": "Delete" },
  "task.editAction": { "zh-CN": "编辑", "en-US": "Edit" },
  "task.complete": { "zh-CN": "完成", "en-US": "Complete" },
  "task.restore": { "zh-CN": "恢复", "en-US": "Restore" },
  "task.today": { "zh-CN": "今日", "en-US": "Today" },
  "task.tomorrow": { "zh-CN": "明天", "en-US": "Tomorrow" },
  "task.snooze": { "zh-CN": "稍后", "en-US": "Snooze" },
  "task.next": { "zh-CN": "下一次", "en-US": "Next" },
  "task.use": { "zh-CN": "使用", "en-US": "Use" },
  "task.moreActions": { "zh-CN": "操作", "en-US": "Actions" },
  "task.title": { "zh-CN": "标题", "en-US": "Title" },
  "task.content": { "zh-CN": "备注", "en-US": "Notes" },
  "task.bodyDetails": { "zh-CN": "添加备注和清单", "en-US": "Add notes and checklist" },
  "task.arrangementSettings": { "zh-CN": "时间与安排", "en-US": "Time and schedule" },
  "task.priority": { "zh-CN": "优先级", "en-US": "Priority" },
  "task.tag": { "zh-CN": "标签", "en-US": "Tag" },
  "task.due": { "zh-CN": "截止", "en-US": "Due" },
  "task.plan": { "zh-CN": "计划", "en-US": "Plan" },
  "task.reminder": { "zh-CN": "提醒", "en-US": "Reminder" },
  "task.repeat": { "zh-CN": "重复", "en-US": "Repeat" },
  "task.template": { "zh-CN": "模板", "en-US": "Template" },
  "task.trash": { "zh-CN": "回收站", "en-US": "Trash" },
  "task.emptyTrash": { "zh-CN": "回收站暂无待办。", "en-US": "No tasks in trash." },
  "task.restoreFromTrash": { "zh-CN": "从回收站恢复", "en-US": "Restore from trash" },
  "task.purge": { "zh-CN": "永久删除", "en-US": "Delete permanently" },
  "task.purgeConfirm": { "zh-CN": "确认永久删除“{title}”？此操作不能从回收站恢复。", "en-US": "Permanently delete \"{title}\"? This cannot be restored from trash." },
  "task.restoreSelectedTrash": { "zh-CN": "恢复所选", "en-US": "Restore selected" },
  "task.purgeSelectedTrash": { "zh-CN": "永久删除所选", "en-US": "Delete selected permanently" },
  "task.purgeSelectedConfirm": {
    "zh-CN": "确认永久删除所选 {count} 条任务？此操作不能从回收站恢复。",
    "en-US": "Permanently delete {count} selected tasks? This cannot be restored from trash.",
  },
  "task.project": { "zh-CN": "项目", "en-US": "Project" },
  "task.list": { "zh-CN": "归类", "en-US": "Location" },
  "task.checklist": { "zh-CN": "清单", "en-US": "Checklist" },
  "task.noDue": { "zh-CN": "无截止时间", "en-US": "No due time" },
  "task.search": { "zh-CN": "搜索标题、内容、标签或项目", "en-US": "Search title, content, tag or project" },
  "task.clearSearch": { "zh-CN": "清空搜索", "en-US": "Clear search" },
  "task.currentFilters": { "zh-CN": "当前筛选", "en-US": "Current filters" },
  "task.syncHealthTitle": { "zh-CN": "同步状态", "en-US": "Sync status" },
  "task.syncHealthReady": {
    "zh-CN": "当前无需处理，继续记录任务，TaskBridge 会自动同步。",
    "en-US": "No action needed. Keep adding tasks and TaskBridge will sync automatically.",
  },
  "task.syncHealthNeedsReview": {
    "zh-CN": "有 {count} 条任务待同步、失败或冲突。清除此设备数据前请先打开同步详情处理。",
    "en-US": "{count} tasks are pending, failed, or conflicted. Open sync details before clearing this device.",
  },
  "task.syncHealthUnknown": {
    "zh-CN": "尚未刷新同步状态。离线时也可以继续记录任务，联网后会自动同步。",
    "en-US": "Sync status has not refreshed yet. You can keep adding tasks offline and sync later.",
  },
  "task.syncHealthDegraded": {
    "zh-CN": "同步服务需要检查。任务会先保存在这台设备，服务恢复后再同步。",
    "en-US": "Sync service needs a check. Tasks stay on this device and sync after service recovery.",
  },
  "task.syncHealthAction": { "zh-CN": "查看同步详情", "en-US": "View sync details" },
  "task.emptySearch": {
    "zh-CN": "没有匹配任务。可以清空搜索，或先输入一个普通标题，例如：写周报。",
    "en-US": "No matching tasks. Clear search or start with a plain title, for example: write weekly report.",
  },
  "task.emptyFiltered": {
    "zh-CN": "当前筛选下暂无待办。清空筛选可查看其他任务；新建时先输入标题，例如：写周报。",
    "en-US": "No tasks match these filters. Clear filters to review the rest, or add one with a plain title such as: write weekly report.",
  },
  "task.empty": {
    "zh-CN": "当前视图暂无待办。可以先输入一个标题，例如：写周报。",
    "en-US": "No tasks in this view. Start with a plain title, for example: write weekly report.",
  },
  "task.emptyToday": {
    "zh-CN": "今天暂无待办。可以先输入今天要做的事，例如：写周报。",
    "en-US": "No tasks due today. Start with something for today, for example: write weekly report.",
  },
  "task.allTitle": { "zh-CN": "全部待办", "en-US": "All tasks" },
  "task.todayTitle": { "zh-CN": "今日待办", "en-US": "Today" },
  "task.todayCountSuffix": { "zh-CN": "条今日待办", "en-US": "tasks today" },
  "task.todayOverview": { "zh-CN": "今日概览", "en-US": "Today overview" },
  "task.overdueCountSuffix": { "zh-CN": "条逾期", "en-US": "overdue" },
  "task.upcomingToday": { "zh-CN": "稍后处理", "en-US": "Upcoming" },
  "task.openCountSuffix": { "zh-CN": "条待办", "en-US": "open tasks" },
  "task.selectedCountSuffix": { "zh-CN": "条已选", "en-US": "selected" },
  "task.completedCountPrefix": { "zh-CN": "已完成", "en-US": "Completed" },
  "task.inbox": { "zh-CN": "收件箱", "en-US": "Inbox" },
  "task.filterOpen": { "zh-CN": "未完成", "en-US": "Open" },
  "task.filterOverdue": { "zh-CN": "逾期", "en-US": "Overdue" },
  "task.filterWeek": { "zh-CN": "本周", "en-US": "This week" },
  "task.filterHigh": { "zh-CN": "高优先级", "en-US": "High priority" },
  "task.filterPending": { "zh-CN": "未同步", "en-US": "Pending sync" },
  "task.moreFilters": { "zh-CN": "列表与状态", "en-US": "Lists and status" },
  "task.projectTagFilters": { "zh-CN": "项目与标签", "en-US": "Projects and tags" },
  "task.statusFilters": { "zh-CN": "待办状态筛选", "en-US": "Task status filters" },
  "task.allProjects": { "zh-CN": "全部项目", "en-US": "All projects" },
  "task.allTags": { "zh-CN": "全部标签", "en-US": "All tags" },
  "task.templateName": { "zh-CN": "模板名称", "en-US": "Template name" },
  "task.checklistPlaceholder": { "zh-CN": "每行一个清单项", "en-US": "One checklist item per line" },
  "task.quickPlaceholder": {
    "zh-CN": "例如：写周报",
    "en-US": "Example: write weekly report",
  },
  "task.autoFillHint": {
    "zh-CN": "只填标题即可保存。需要时，也可以把时间、标签或优先级写进标题让系统识别。",
    "en-US": "Title is enough. You can also add time, tags, or priority in the title when needed.",
  },
  "task.scheduleHelp": {
    "zh-CN": "计划表示哪天要做；截止表示最晚完成时间；提醒只负责通知。",
    "en-US": "Plan is when you intend to work on it; due is the latest finish time; reminder only sends a notification.",
  },
  "task.moreSettings": { "zh-CN": "更多：标签、重复、模板", "en-US": "More: tags, repeat, templates" },
  "task.hideSettings": { "zh-CN": "收起更多", "en-US": "Hide more" },
  "task.saveTemplate": { "zh-CN": "保存为模板", "en-US": "Save as template" },
  "task.feedbackSaved": { "zh-CN": "已保存", "en-US": "Saved" },
  "task.feedbackCompleted": { "zh-CN": "已完成", "en-US": "Completed" },
  "task.feedbackRestored": { "zh-CN": "已恢复", "en-US": "Restored" },
  "task.feedbackDeleted": { "zh-CN": "已删除，可在回收站恢复", "en-US": "Deleted. You can restore it from the recycle bin." },
  "task.feedbackPurged": { "zh-CN": "已永久删除", "en-US": "Permanently deleted" },
  "task.feedbackBatchCompleted": { "zh-CN": "已完成所选待办", "en-US": "Selected tasks completed" },
  "task.feedbackBatchDeleted": { "zh-CN": "所选待办已移入回收站", "en-US": "Selected tasks moved to trash" },
  "task.feedbackBatchRestored": { "zh-CN": "所选任务已恢复", "en-US": "Selected tasks restored" },
  "task.feedbackBatchPurged": { "zh-CN": "所选任务已永久删除", "en-US": "Selected tasks permanently deleted" },
  "task.completeVisible": { "zh-CN": "完成所选", "en-US": "Complete selected" },
  "task.completeVisibleConfirm": {
    "zh-CN": "确认完成所选 {count} 条未完成待办？完成后可以在已完成中查看。",
    "en-US": "Complete {count} selected open tasks? You can review them in completed items.",
  },
  "task.deleteVisible": { "zh-CN": "删除所选", "en-US": "Delete selected" },
  "task.deleteVisibleConfirm": {
    "zh-CN": "确认删除所选 {count} 条未完成待办？删除后可以在回收站恢复。",
    "en-US": "Delete {count} selected open tasks? You can restore them from trash.",
  },
  "task.bulkActions": { "zh-CN": "所选任务批量操作", "en-US": "Selected task batch actions" },
  "task.enterSelectionMode": { "zh-CN": "批量选择任务", "en-US": "Select multiple tasks" },
  "task.clearSelection": { "zh-CN": "取消选择", "en-US": "Clear selection" },
  "sync.synced": { "zh-CN": "已同步", "en-US": "Synced" },
  "sync.syncing": { "zh-CN": "同步中", "en-US": "Syncing" },
  "sync.offline": { "zh-CN": "离线", "en-US": "Offline" },
  "sync.error": { "zh-CN": "同步异常", "en-US": "Sync error" },
  "sync.manual": { "zh-CN": "立即同步", "en-US": "Sync now" },
  "sync.details": { "zh-CN": "同步详情", "en-US": "Sync details" },
  "sync.retry": { "zh-CN": "重试", "en-US": "Retry" },
  "sync.offlineWorkspace": { "zh-CN": "当前处于离线状态，仍可继续处理本地任务。", "en-US": "You are offline. You can keep working on local tasks." },
  "sync.attentionWorkspace": { "zh-CN": "同步遇到问题，请重试或查看详情。", "en-US": "Sync needs attention. Retry or view details." },
  "sync.attentionWorkspaceCount": { "zh-CN": "同步有 {count} 个问题需要处理。", "en-US": "{count} sync issues need attention." },
  "sync.pendingCreate": { "zh-CN": "待创建", "en-US": "Pending create" },
  "sync.pendingUpdate": { "zh-CN": "待同步", "en-US": "Pending sync" },
  "sync.pendingDelete": { "zh-CN": "待删除", "en-US": "Pending delete" },
  "sync.failed": { "zh-CN": "同步失败", "en-US": "Sync failed" },
  "sync.conflict": { "zh-CN": "冲突", "en-US": "Conflict" },
  "sync.conflictExists": { "zh-CN": "存在同步冲突", "en-US": "has a sync conflict" },
  "sync.localSnapshot": { "zh-CN": "这台设备", "en-US": "This device" },
  "sync.cloudSnapshot": { "zh-CN": "同步来的版本", "en-US": "Synced version" },
  "sync.cloudSnapshotMissing": { "zh-CN": "同步来的版本暂不可预览", "en-US": "Synced version preview unavailable" },
  "sync.conflictFields": { "zh-CN": "差异", "en-US": "Differences" },
  "sync.conflictNoFieldDiff": {
    "zh-CN": "未检测到可展示的字段差异，请根据两侧版本信息选择保留哪一版",
    "en-US": "No displayable field differences were detected. Use the version details to choose which version to keep",
  },
  "sync.useServer": { "zh-CN": "保留同步来的版本", "en-US": "Keep synced version" },
  "sync.overwriteServer": { "zh-CN": "保留这台设备版本", "en-US": "Keep this device version" },
  "sync.useCloud": { "zh-CN": "保留同步来的版本", "en-US": "Keep synced version" },
  "sync.overwriteCloud": { "zh-CN": "保留这台设备版本", "en-US": "Keep this device" },
  "sync.conflictHelp": {
    "zh-CN": "请先比较这台设备和同步来的版本。保留同步来的版本会放弃这台设备的修改；保留这台设备版本会同步到其他设备。",
    "en-US": "Compare this device and the synced version first. Keeping the synced version discards this device's changes; keeping this device syncs it to other devices.",
  },
  "sync.useCloudConfirm": {
    "zh-CN": "确认保留同步来的版本？这会放弃这台设备上的当前修改。",
    "en-US": "Keep the synced version? This discards the current changes on this device.",
  },
  "sync.overwriteCloudConfirm": {
    "zh-CN": "确认保留这台设备版本？同步后其他设备会看到这个版本。",
    "en-US": "Keep this device's version? Other devices will see this version after sync.",
  },
  "sync.logoutPendingWarning": {
    "zh-CN": "当前仍有未同步、同步失败或冲突的任务。退出后本机数据仍保留，但其他设备暂时看不到这些修改。仍要退出吗？",
    "en-US": "Some tasks are still pending, failed, or conflicted. Local data stays on this device, but other devices may not see those changes yet. Log out anyway?",
  },
  "settings.title": { "zh-CN": "设置", "en-US": "Settings" },
  "settings.subtitle": { "zh-CN": "常用设置与数据安全", "en-US": "Settings and data safety" },
  "settings.navCommon": { "zh-CN": "常用设置", "en-US": "Common settings" },
  "settings.navDataSafety": { "zh-CN": "数据安全", "en-US": "Data safety" },
  "settings.navSyncRecovery": { "zh-CN": "同步问题", "en-US": "Sync issues" },
  "settings.navAdvancedMaintenance": { "zh-CN": "高级维护", "en-US": "Advanced maintenance" },
  "settings.save": { "zh-CN": "保存", "en-US": "Save" },
  "settings.saveDisplayPreferences": { "zh-CN": "保存显示与窗口设置", "en-US": "Save display and window settings" },
  "settings.saveHint": {
    "zh-CN": "语言和主题会立即应用；窗口、悬浮窗和开机启动点击此处保存。连接、备份和诊断操作在各自区域立即执行。",
    "en-US": "Language and theme apply immediately. Use this button for window, floating window, and auto-start settings. Connection, backup, and diagnostics run in their own sections.",
  },
  "settings.autoSaved": { "zh-CN": "已自动保存。", "en-US": "Auto-saved." },
  "settings.autoSaveHint": {
    "zh-CN": "语言、主题、时区、窗口和开机启动会立即保存；连接、备份和诊断在各自区域内直接生效。",
    "en-US": "Language, theme, time zone, window, and auto-start settings save immediately. Connection, backup, and diagnostics apply in their own areas.",
  },
  "settings.language": { "zh-CN": "界面语言", "en-US": "Language" },
  "settings.languageZh": { "zh-CN": "中文", "en-US": "Chinese" },
  "settings.languageEn": { "zh-CN": "英文", "en-US": "English" },
  "settings.desktopTheme": { "zh-CN": "桌面主题", "en-US": "Desktop theme" },
  "settings.desktopThemeHint": { "zh-CN": "点击色块会立即切换，并自动记住当前选择。", "en-US": "Pick a palette to apply it immediately and remember the choice." },
  "settings.connection": { "zh-CN": "连接与同步", "en-US": "Connection and sync" },
  "settings.serverUrl": { "zh-CN": "服务器地址", "en-US": "Server URL" },
  "settings.serverUrlHint": { "zh-CN": "填写 TaskBridge 服务器地址即可，高级连接设置会自动生成。", "en-US": "Enter the TaskBridge server address. Advanced connection settings are generated automatically." },
  "settings.applyServerUrl": { "zh-CN": "应用地址", "en-US": "Apply URL" },
  "settings.saveConnection": { "zh-CN": "保存连接", "en-US": "Save connection" },
  "settings.checkAndSaveConnection": { "zh-CN": "检查连接", "en-US": "Test connection" },
  "settings.checkAndSaveAdvancedConnection": { "zh-CN": "保存并检查高级连接", "en-US": "Save and test advanced connection" },
  "settings.testConnection": { "zh-CN": "测试连接", "en-US": "Test connection" },
  "settings.connectionTesting": { "zh-CN": "测试中...", "en-US": "Testing..." },
  "settings.loginAutoChecksConnection": {
    "zh-CN": "登录会自动检查连接；检查连接只用于排查服务器地址。",
    "en-US": "Signing in checks the connection automatically. Use Test connection only when troubleshooting the server address.",
  },
  "settings.connectionSaved": { "zh-CN": "连接设置已保存。", "en-US": "Connection settings saved." },
  "settings.apiConnectionReady": {
    "zh-CN": "API 可用；登录后会继续验证实时同步。",
    "en-US": "The API is available. Real-time sync will be verified after sign-in.",
  },
  "settings.connectionReady": {
    "zh-CN": "API 可用；请在同步状态中确认实时同步。",
    "en-US": "The API is available. Check Sync status to confirm real-time sync.",
  },
  "settings.connectionFailed": { "zh-CN": "连接失败：", "en-US": "Connection failed: " },
  "settings.discardConnectionChangesConfirm": {
    "zh-CN": "连接地址还有未保存的修改，离开后会丢失。仍要离开吗？",
    "en-US": "Connection addresses have unsaved changes. Leave and discard them?",
  },
  "settings.serverUrlRequired": { "zh-CN": "请输入服务器地址。", "en-US": "Enter the server address." },
  "settings.localhostHint": {
    "zh-CN": "127.0.0.1 只适合连接这台电脑上的后端；手机或另一台电脑请填写后端所在电脑的局域网 IP 或域名。",
    "en-US": "127.0.0.1 only reaches the backend on this computer. Phones or other computers need the backend computer's LAN IP or domain.",
  },
  "settings.showAdvancedConnection": { "zh-CN": "排障：自定义连接地址", "en-US": "Troubleshooting: custom connection URLs" },
  "settings.advancedEndpoints": { "zh-CN": "排障：自定义连接地址", "en-US": "Troubleshooting: custom connection URLs" },
  "settings.resetGeneratedEndpoints": { "zh-CN": "按服务器地址重新生成", "en-US": "Regenerate from server URL" },
  "settings.baseUrl": { "zh-CN": "自定义请求地址", "en-US": "Request address for custom proxy" },
  "settings.wsUrl": { "zh-CN": "自定义同步地址", "en-US": "Sync address for custom proxy" },
  "settings.baseUrlHint": { "zh-CN": "仅在反向代理拆分接口路径时修改，保存后新的请求会使用这个地址。", "en-US": "Change only when a reverse proxy splits the request path. New requests use this address after saving." },
  "settings.wsUrlHint": { "zh-CN": "仅在反向代理拆分同步路径时修改，保存后同步连接会使用这个地址。", "en-US": "Change only when a reverse proxy splits the sync path. Sync uses this address after saving." },
  "settings.deviceId": { "zh-CN": "设备 ID", "en-US": "Device ID" },
  "settings.lastSyncTime": { "zh-CN": "上次同步时间", "en-US": "Last sync time" },
  "settings.syncAtAGlance": { "zh-CN": "同步一眼判断", "en-US": "Sync at a glance" },
  "settings.syncLooksGood": { "zh-CN": "当前没有待同步、失败或冲突的任务，通常不需要手动处理。", "en-US": "No pending, failed, or conflicting tasks are shown. You usually do not need to do anything." },
  "settings.syncNeedsAttention": { "zh-CN": "存在待同步、失败或冲突的任务，请在同步详情中处理。", "en-US": "Pending, failed, or conflicting tasks need attention. Check sync details." },
  "settings.syncNextStep": { "zh-CN": "下一步", "en-US": "Next step" },
  "settings.syncNextStepNone": { "zh-CN": "继续记录任务，TaskBridge 会自动同步。", "en-US": "Keep adding tasks. TaskBridge will sync automatically." },
  "settings.syncNextStepReview": { "zh-CN": "打开同步详情，先处理失败或冲突，再清除这台设备的数据。", "en-US": "Open sync details, resolve failed items or conflicts, then clear this device only after it is clean." },
  "settings.localDataTrust": { "zh-CN": "本机数据只影响这台设备；清除这台设备不会删除服务器上的任务。操作前可先导出本机备份。", "en-US": "Local data only affects this device. Clearing this device will not delete server tasks. Export a local backup first if needed." },
  "settings.syncDiagnostics": { "zh-CN": "同步详情", "en-US": "Sync details" },
  "settings.pendingQueueCount": { "zh-CN": "等待同步", "en-US": "Waiting to sync" },
  "settings.exhaustedQueueCount": { "zh-CN": "需要重试", "en-US": "Needs retry" },
  "settings.failedTaskCount": { "zh-CN": "同步失败", "en-US": "Failed sync" },
  "settings.conflictCount": { "zh-CN": "冲突任务", "en-US": "Conflicts" },
  "settings.diagnosticsUpdatedAt": { "zh-CN": "诊断刷新时间", "en-US": "Diagnostics updated" },
  "settings.refreshDiagnostics": { "zh-CN": "刷新诊断", "en-US": "Refresh diagnostics" },
  "settings.syncRecoveryCenter": { "zh-CN": "同步问题", "en-US": "Sync issues" },
  "settings.retryExhaustedQueue": { "zh-CN": "重试待处理或失败同步", "en-US": "Retry pending or failed sync" },
  "settings.retryExhaustedDone": { "zh-CN": "已重新发起待处理或失败的同步。", "en-US": "Retry for pending or failed sync has started." },
  "settings.noExhaustedQueueItems": { "zh-CN": "当前没有需要手动重试的任务。", "en-US": "No tasks need a manual retry." },
  "settings.pendingOrFailedSyncRetryAvailable": { "zh-CN": "有等待中或失败的同步修改，可以立即重试。", "en-US": "Pending or failed sync changes can be retried now." },
  "settings.syncIssueAction": { "zh-CN": "动作", "en-US": "Action" },
  "settings.syncIssueAttempts": { "zh-CN": "重试次数", "en-US": "Attempts" },
  "settings.syncIssueCreatedAt": { "zh-CN": "入队时间", "en-US": "Queued at" },
  "settings.exportDiagnostics": { "zh-CN": "导出诊断包", "en-US": "Export diagnostics" },
  "settings.diagnosticsSupportTools": { "zh-CN": "技术信息（排查时使用）", "en-US": "Technical information (for troubleshooting)" },
  "settings.diagnosticsSensitiveHint": {
    "zh-CN": "诊断包会包含任务标题、冲突快照和同步详情，分享前请确认接收方可信。",
    "en-US": "Diagnostics include task titles, conflict snapshots, and sync details. Share only with trusted recipients.",
  },
  "settings.confirmDiagnosticsExport": {
    "zh-CN": "诊断包可能包含任务标题、冲突快照和同步详情。确认要导出吗？",
    "en-US": "Diagnostics may include task titles, conflict snapshots, and sync details. Export anyway?",
  },
  "settings.diagnosticsExported": { "zh-CN": "诊断包已导出：", "en-US": "Diagnostics exported: " },
  "settings.diagnosticsExportCanceled": { "zh-CN": "已取消诊断包导出。", "en-US": "Diagnostics export canceled." },
  "settings.updateStatus": { "zh-CN": "更新状态", "en-US": "Update status" },
  "settings.updateTechnicalDetails": { "zh-CN": "更新技术详情", "en-US": "Update technical details" },
  "settings.autoStart": { "zh-CN": "开机启动 TaskBridge", "en-US": "Start TaskBridge with Windows" },
  "settings.floatingVisibleOnStart": { "zh-CN": "启动后显示悬浮窗", "en-US": "Show floating window on start" },
  "settings.floatingOpacity": { "zh-CN": "悬浮窗透明度", "en-US": "Floating opacity" },
  "settings.displayTimeZone": { "zh-CN": "显示时区", "en-US": "Display time zone" },
  "settings.displayTimeZoneHint": {
    "zh-CN": "任务时间按该时区显示，同步数据仍以 UTC 保存。",
    "en-US": "Task times use this time zone. Sync data remains stored as UTC.",
  },
  "settings.accountDisplay": { "zh-CN": "账号与显示", "en-US": "Account and display" },
  "settings.accountSecurity": { "zh-CN": "账号安全", "en-US": "Account security" },
  "settings.refreshSessions": { "zh-CN": "刷新会话", "en-US": "Refresh sessions" },
  "settings.changePassword": { "zh-CN": "修改密码", "en-US": "Change password" },
  "settings.currentPassword": { "zh-CN": "当前密码", "en-US": "Current password" },
  "settings.newPassword": { "zh-CN": "新密码", "en-US": "New password" },
  "settings.confirmNewPassword": { "zh-CN": "确认新密码", "en-US": "Confirm new password" },
  "settings.passwordMismatch": { "zh-CN": "两次输入的新密码不一致。", "en-US": "The new passwords do not match." },
  "settings.passwordChanged": {
    "zh-CN": "密码已修改，并注销了 {count} 个其他会话。",
    "en-US": "Password changed and {count} other sessions were revoked.",
  },
  "settings.passwordChangeFailed": { "zh-CN": "密码修改失败。", "en-US": "Could not change the password." },
  "settings.activeSessions": { "zh-CN": "登录会话", "en-US": "Sign-in sessions" },
  "settings.sessionSecurityHint": {
    "zh-CN": "发现不认识的会话时请立即吊销；吊销当前会话后需要重新登录。",
    "en-US": "Revoke sessions you do not recognize. Revoking the current session requires signing in again.",
  },
  "settings.loadingSessions": { "zh-CN": "正在加载会话...", "en-US": "Loading sessions..." },
  "settings.noActiveSessions": { "zh-CN": "未找到活动会话。", "en-US": "No active sessions found." },
  "settings.thisDevice": { "zh-CN": "此设备", "en-US": "This device" },
  "settings.unknownDevice": { "zh-CN": "未知设备", "en-US": "Unknown device" },
  "settings.sessionCreated": { "zh-CN": "登录时间", "en-US": "Signed in" },
  "settings.sessionExpires": { "zh-CN": "到期时间", "en-US": "Expires" },
  "settings.revokeSession": { "zh-CN": "吊销", "en-US": "Revoke" },
  "settings.revokeSessionConfirm": {
    "zh-CN": "吊销这个登录会话？该会话随后需要重新登录。",
    "en-US": "Revoke this sign-in session? It will need to sign in again.",
  },
  "settings.sessionRevoked": { "zh-CN": "会话已吊销。", "en-US": "Session revoked." },
  "settings.sessionRevokeFailed": { "zh-CN": "无法吊销会话。", "en-US": "Could not revoke the session." },
  "settings.revokeOtherSessions": { "zh-CN": "注销其他设备", "en-US": "Sign out other devices" },
  "settings.revokeOtherSessionsConfirm": {
    "zh-CN": "注销其他设备上的所有会话？这些设备随后需要重新登录。",
    "en-US": "Sign out every other device? Those devices will need to sign in again.",
  },
  "settings.otherSessionsRevoked": {
    "zh-CN": "已注销 {count} 个其他设备会话。",
    "en-US": "Signed out {count} sessions on other devices.",
  },
  "settings.sessionsLoadFailed": { "zh-CN": "无法加载登录会话。", "en-US": "Could not load sign-in sessions." },
  "settings.serverTodayCount": { "zh-CN": "服务器今日待办（当前时区）", "en-US": "Server tasks today (current time zone)" },
  "settings.serverOverdueCount": { "zh-CN": "服务器逾期待办", "en-US": "Server overdue tasks" },
  "settings.dataSession": { "zh-CN": "数据与备份", "en-US": "Data and backups" },
  "settings.dataTools": { "zh-CN": "备份与本机数据", "en-US": "Backups and local data" },
  "settings.general": { "zh-CN": "基础", "en-US": "General" },
  "settings.window": { "zh-CN": "窗口", "en-US": "Window" },
  "settings.backup": { "zh-CN": "备份", "en-US": "Backup" },
  "settings.session": { "zh-CN": "会话", "en-US": "Session" },
  "settings.updates": { "zh-CN": "更新", "en-US": "Updates" },
  "settings.metadata": { "zh-CN": "项目与标签", "en-US": "Projects and tags" },
  "settings.exportBackup": { "zh-CN": "导出本地备份", "en-US": "Export local backup" },
  "settings.importBackup": { "zh-CN": "导入本地备份", "en-US": "Import local backup" },
  "settings.checkUpdates": { "zh-CN": "检查更新", "en-US": "Check updates" },
  "settings.clearLocalData": { "zh-CN": "清除此设备数据", "en-US": "Clear this device" },
  "settings.clearLocalDataSafetyHint": {
    "zh-CN": "清除前先确认没有待同步、同步失败或冲突的任务；不确定时先导出本地备份。",
    "en-US": "Before clearing, check that there are no pending, failed, or conflicting tasks. Export a local backup if unsure.",
  },
  "settings.clearLocalDataBlocked": {
    "zh-CN": "当前还有待同步、同步失败或冲突的任务。请先处理同步详情，或先导出本地备份后再清除此设备数据。",
    "en-US": "This device still has pending, failed, or conflicting tasks. Handle sync details, or export a local backup before clearing this device.",
  },
  "settings.clearLocalDataConfirm": {
    "zh-CN": "这会退出登录，并删除这台电脑上的本地任务、等待同步的修改和离线缓存。服务器上的任务不会被删除。建议先导出本地备份。",
    "en-US": "This logs out and deletes local tasks, waiting-to-sync changes, and offline cache on this computer. Server tasks will not be deleted. Export a local backup first if needed.",
  },
  "settings.clearLocalDataConfirmMessage": {
    "zh-CN": "这会退出登录，并删除这台电脑上的本地任务、等待同步的修改和离线缓存。服务器上的任务不会被删除。清除前请确认没有待同步、同步失败或冲突的任务；不确定时先导出本地备份。",
    "en-US": "This logs out and deletes local tasks, waiting-to-sync changes, and offline cache on this computer. Server tasks will not be deleted. Before clearing, check there are no pending, failed, or conflicting tasks. Export a local backup first if unsure.",
  },
  "settings.localDataCleared": { "zh-CN": "已清除此设备数据。", "en-US": "This device's local data was cleared." },
  "settings.confirmBackupImport": {
    "zh-CN": "将从所选备份导入 {count} 条任务，跳过 {skipped} 条无效任务。只能撤销最近一次导入，且导入后编辑过的任务会保留。是否继续？",
    "en-US": "Import {count} tasks from the selected backup and skip {skipped} invalid tasks. Only the most recent import can be undone, and tasks edited after import will be kept. Continue?",
  },
  "settings.undoLastImport": { "zh-CN": "撤销上次导入", "en-US": "Undo last import" },
  "settings.importUndoDone": { "zh-CN": "已撤销 {count} 条导入任务。", "en-US": "Undid {count} imported tasks." },
  "settings.projectFrom": { "zh-CN": "项目原名", "en-US": "Current project name" },
  "settings.projectTo": { "zh-CN": "项目新名", "en-US": "New project name" },
  "settings.tagFrom": { "zh-CN": "标签原名", "en-US": "Current tag name" },
  "settings.tagTo": { "zh-CN": "标签新名", "en-US": "New tag name" },
  "settings.renameProject": { "zh-CN": "重命名项目", "en-US": "Rename project" },
  "settings.renameTag": { "zh-CN": "重命名标签", "en-US": "Rename tag" },
  "settings.confirmMetadataRename": {
    "zh-CN": "将影响 {count} 条任务。新名称为空时会清空该字段。是否继续？",
    "en-US": "This affects {count} tasks. Leaving the new name empty clears this field. Continue?",
  },
  "settings.saved": { "zh-CN": "设置已保存。", "en-US": "Settings saved." },
  "settings.exportCanceled": { "zh-CN": "已取消导出。", "en-US": "Export canceled." },
  "settings.exported": { "zh-CN": "已导出：", "en-US": "Exported: " },
  "settings.importCanceled": { "zh-CN": "已取消导入。", "en-US": "Import canceled." },
  "settings.imported": { "zh-CN": "已导入 ", "en-US": "Imported " },
  "settings.importedSuffix": { "zh-CN": " 条任务。", "en-US": " tasks." },
  "settings.importFailed": { "zh-CN": "导入失败：", "en-US": "Import failed: " },
  "settings.importSkippedPrefix": { "zh-CN": " 跳过 ", "en-US": " Skipped " },
  "settings.importSkippedSuffix": { "zh-CN": " 条无效任务。", "en-US": " invalid tasks." },
  "settings.projectRenamed": { "zh-CN": "项目已更新。", "en-US": "Project updated." },
  "settings.tagRenamed": { "zh-CN": "标签已更新。", "en-US": "Tag updated." },
  "floating.todayTasks": { "zh-CN": "项今日待办", "en-US": "tasks today" },
  "floating.todayList": { "zh-CN": "今日待办", "en-US": "Today" },
  "floating.loginRequired": { "zh-CN": "请先登录 TaskBridge", "en-US": "Please log in to TaskBridge" },
  "floating.noToday": { "zh-CN": "今天暂无待办", "en-US": "No tasks today" },
  "floating.openMain": { "zh-CN": "打开主窗口", "en-US": "Open main window" },
  "floating.openMainShort": { "zh-CN": "打开", "en-US": "Open" },
  "floating.hide": { "zh-CN": "隐藏悬浮窗", "en-US": "Hide floating window" },
  "floating.hideShort": { "zh-CN": "隐藏", "en-US": "Hide" },
  "floating.tools": { "zh-CN": "工具", "en-US": "Tools" },
  "floating.opacity": { "zh-CN": "透明度", "en-US": "Opacity" },
  "floating.addTask": { "zh-CN": "添加待办", "en-US": "Add task" },
  "floating.refresh": { "zh-CN": "刷新", "en-US": "Refresh" },
  "floating.resize": { "zh-CN": "调整大小", "en-US": "Resize" },
  "floating.feedbackAdded": { "zh-CN": "已添加", "en-US": "Added" },
  "floating.feedbackAddedInbox": { "zh-CN": "已添加到收件箱，可在主窗口查看", "en-US": "Added to Inbox. Open the main window to view" },
  "floating.feedbackCompleted": { "zh-CN": "已完成", "en-US": "Completed" },
  "floating.hiddenTasks": { "zh-CN": "另有 {count} 项，打开主窗口", "en-US": "{count} more. Open main window" },
  "floating.placeholder": {
    "zh-CN": "快速添加待办",
    "en-US": "Quick add task",
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
