import {
  applyOfflineTaskAction,
  attemptSessionRevocation,
  buildPersistentSessionSuppressionMarker,
  buildRefreshRequestBody,
  buildTaskSchedulePatch,
  buildPasswordChangePayload,
  buildOfflineDatabaseName,
  buildOfflineWorkspaceKey,
  buildConflictOverwritePayload,
  buildLocalMeta,
  buildTaskDraftStorageKey,
  buildTaskNotificationUrl,
  canResolveTaskConflict,
  canApplySessionRefreshResult,
  clearAccountScopedInputs,
  compareCachedTasks,
  coordinateRefreshSession,
  createLatestRequestGate,
  deleteIndexedDatabase,
  getTaskReminderAt,
  getSelectableTaskIds,
  getApiRequestCredentialsMode,
  hasOfflineQueueId,
  isCompletedTask,
  isMixedContentApiUrl,
  isOfflineProfileForApi,
  isPersistentSessionSuppressed,
  isTerminalRefreshStatus,
  makeOfflineTask,
  makeTaskFromTemplate,
  makeTaskPayloadFromTemplate,
  mapTaskViewForServer,
  matchesTaskView,
  normalizeBrowserTimeZone,
  normalizeOfflineProfile,
  normalizeRemoteTaskForOffline,
  processIndependentMutationQueue,
  reconcileCachedTaskSnapshot,
  reconcileSelectedTaskIds,
  shouldConfirmTaskAction,
  shouldShowConnectionBadge,
  withRefreshLease,
  withClientRequestId,
} from "./offline-core.js?v=0.2.0";

const LOCAL_FALLBACK_SERVER_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_SERVER_BASE_URL = supportsHttpOrigin() ? location.origin : LOCAL_FALLBACK_SERVER_BASE_URL;
const DEFAULT_API_BASE_URL = deriveApiBaseUrlFromServer(DEFAULT_SERVER_BASE_URL);
const DISPLAY_TIME_ZONE = normalizeBrowserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
const STORAGE_PREFIX = "taskbridge.web.v1";
const SESSION_CHANNEL_NAME = `${STORAGE_PREFIX}.session`;
const SESSION_REFRESH_LOCK_NAME = `${STORAGE_PREFIX}.refresh`;
const WEB_BACKUP_FORMAT = "taskbridge.local.backup.v1";
const ACCEPTED_WEB_BACKUP_FORMATS = new Set([
  WEB_BACKUP_FORMAT,
  "taskbridge.android.backup.v1",
  "taskbridge.desktop.backup.v1",
]);
const WEB_BACKUP_MAX_IMPORT_BYTES = 20_000_000;
const WEB_BACKUP_MAX_IMPORT_TASKS = 100_000;
const LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY = "lastImportedBackupTaskIds";
const OFFLINE_PROFILE_STORAGE_KEY = "offlineProfile";
const LEGACY_OFFLINE_PROFILE_STORAGE_KEY = "legacyOfflineProfile";
const PERSISTENT_SESSION_SUPPRESSED_KEY = "persistentSessionSuppressed";
const SESSION_REFRESH_LEASE_STORAGE_KEY = "sessionRefreshLease";
const TASK_LIMIT = 100;
const OFFLINE_TASK_RENDER_STEP = TASK_LIMIT;
const MAX_TASK_PAGES = 50;
const APP_VERSION_META_SELECTOR = 'meta[name="taskbridge-version"]';
const WEB_APP_VERSION = document.querySelector(APP_VERSION_META_SELECTOR)?.content?.trim() || "0.2.0";
const WEB_OFFLINE_DB_VERSION = 1;
const OFFLINE_TASK_STORE = "tasks";
const OFFLINE_QUEUE_STORE = "offline_mutations";
const OFFLINE_META_STORE = "meta";
const OFFLINE_CACHE_READY_META_KEY = "cache_ready";
const LOCAL_STORAGE_STRING_KEYS = new Set([
  "serverBaseUrl",
  "apiBaseUrl",
  "deviceId",
  "taskSearch",
  "taskView",
  "taskProjectFilter",
  "taskTagFilter",
  "language",
  "clientErrorReportingEnabled",
  OFFLINE_PROFILE_STORAGE_KEY,
  LEGACY_OFFLINE_PROFILE_STORAGE_KEY,
  LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY,
  PERSISTENT_SESSION_SUPPRESSED_KEY,
  SESSION_REFRESH_LEASE_STORAGE_KEY,
]);
const STORED_API_BASE_URL = readStoredString("apiBaseUrl", "");
const INITIAL_API_BASE_URL = DEFAULT_API_BASE_URL;
const STORED_SESSION_MATCHES_DEPLOYMENT = readSessionString("apiBaseUrl", "") === DEFAULT_API_BASE_URL;
let offlineProfileLegacyMigrationPending = false;
const PRIMARY_VIEW_OPTIONS = [
  { value: "", labelKey: "view.all" },
  { value: "today", labelKey: "view.today" },
  { value: "overdue", labelKey: "view.overdue" },
  { value: "completed", labelKey: "view.completed" },
];
const MORE_VIEW_OPTIONS = [
  { value: "inbox", labelKey: "view.inbox" },
  { value: "week", labelKey: "view.week" },
  { value: "high", labelKey: "view.high" },
  { value: "pending", labelKey: "view.pending" },
  { value: "conflict", labelKey: "view.conflict" },
  { value: "templates", labelKey: "view.templates" },
  { value: "trash", labelKey: "view.trash" },
];
const VIEW_OPTIONS = [...PRIMARY_VIEW_OPTIONS, ...MORE_VIEW_OPTIONS];
const EMPTY_STATE_CREATE_VIEWS = new Set(["", "inbox", "today"]);

const state = {
  apiBaseUrl: INITIAL_API_BASE_URL,
  deviceId: readStoredString("deviceId", `web-${crypto.randomUUID()}`),
  language: getInitialLanguage(),
  authMode: "login",
  passwordVisible: false,
  registrationEnabled: false,
  registrationStatusKnown: false,
  accessToken: STORED_SESSION_MATCHES_DEPLOYMENT ? readSessionString("accessToken", "") : "",
  refreshToken: STORED_SESSION_MATCHES_DEPLOYMENT ? readSessionString("refreshToken", "") : "",
  user: STORED_SESSION_MATCHES_DEPLOYMENT ? readSessionJson("user", null) : null,
  offlineMode: false,
  offlineProfile: readOfflineProfile(),
  offlineCacheReady: false,
  tasks: [],
  selectedTaskIds: new Set(),
  selectedTrashTaskIds: new Set(),
  taskSelectionMode: false,
  meta: null,
  syncStatus: null,
  sessions: [],
  search: "",
  view: "today",
  projectFilter: "",
  tagFilter: "",
  checklistDraftItems: [],
  editingTaskId: null,
  editingTaskVersion: null,
  editorOpen: false,
  offlineQueueCount: 0,
  offlineLastSyncedAt: "",
  cachedTaskTotalCount: 0,
  cachedTaskVisibleCount: 0,
  cachedTaskListLimited: false,
  offlineTaskRenderLimit: TASK_LIMIT,
  clientErrorReportingEnabled: readStoredString("clientErrorReportingEnabled", "false") === "true",
  notificationTaskId: readNotificationTaskId(),
  notificationScheduledCount: 0,
  loading: false,
  message: "",
};

const I18N = {
  "zh-CN": {
    "brand.tagline": "跨设备待办",
    "language.label": "语言",
    "common.submitting": "提交中...",
    "install.action": "查看安装方法",
    "install.installApp": "安装应用",
    "install.installed": "应用已安装",
    "install.title": "安装 TaskBridge",
    "install.defaultHelp": "根据当前浏览器选择安装入口。",
    "install.close": "关闭",
    "install.alreadyInstalled": "当前已经以应用方式打开。",
    "install.iosSafari": "在 Safari 中点击分享按钮，然后选择“添加到主屏幕”。",
    "install.androidChrome": "在 Chrome 中打开右上角菜单，选择“安装应用”或“添加到主屏幕”。",
    "install.edge": "在 Edge 地址栏或菜单中选择“应用”，再选择“安装此站点为应用”。",
    "install.chrome": "在 Chrome 地址栏点击安装图标，或打开右上角菜单选择“安装 TaskBridge”。",
    "install.generic": "当前浏览器可能不会显示安装按钮。可以先固定书签，或用 Chrome、Edge、Safari 打开后安装。",
    "install.insecureContext": "局域网 HTTP 和 WS 仍可使用，但当前连接不能安装 PWA 或缓存离线页面。请改用 HTTPS，或在服务器本机通过 localhost 打开。",
    "startup.title": "页面资源需要刷新",
    "startup.message": "如果页面长时间没有响应，可能是浏览器还保留着旧的页面资源缓存。刷新不会删除你的本机任务。",
    "startup.reload": "刷新页面",
    "startup.clearAndReload": "清除页面资源缓存并刷新",
    "sync.status": "同步状态",
    "auth.logout": "退出",
    "auth.signInToSync": "登录并同步",
    "auth.resumeOffline": "继续离线使用",
    "auth.resumeOfflineHint": "打开这台设备上次同步的任务；重新联网后需要登录才能同步。",
    "auth.offlineModeActive": "正在使用本机任务。修改会保存在这台设备上，登录后再同步。",
    "auth.offlineProfileUnavailable": "没有找到可用的本机任务身份，请先联网登录一次。",
    "auth.loggedIn": "已登录",
    "auth.loginSuccess": "登录成功",
    "auth.eyebrow": "跨设备待办",
    "auth.title": "登录 TaskBridge",
    "auth.modeLabel": "登录模式",
    "auth.login": "登录",
    "auth.register": "注册",
    "auth.username": "用户名",
    "auth.email": "邮箱",
    "auth.account": "账号",
    "auth.password": "密码",
    "auth.forgotPasswordHelp": "忘记密码？请联系服务器管理员重置。",
    "auth.showPassword": "显示密码",
    "auth.hidePassword": "隐藏密码",
    "auth.registrationPending": "点击“注册”会自动检查当前服务器是否开放注册。已有账号可直接登录。",
    "auth.registrationCheckFailed": "暂时无法确认是否开放注册，请稍后重试或联系管理员。已有账号可直接登录。",
    "auth.registrationEnabled": "当前服务器允许开放注册，可以创建账号。",
    "auth.registrationDisabled": "当前服务器已关闭开放注册。请使用已有账号登录，或联系服务器管理员创建账号。",
    "auth.logoutTitle": "退出登录？",
    "auth.logoutConfirm": "仍要退出",
    "auth.loggedOut": "已退出",
    "auth.loggedOutRevocationUnconfirmed": "本机已退出，但服务器未确认撤销此会话。网络恢复后请重新登录并检查登录设备。",
    "auth.logoutPendingWarning": "当前仍有未同步、同步失败或冲突的任务。退出后本机缓存仍保留，但其他设备暂时看不到这些修改。仍要退出吗？",
    "app.account": "账户",
    "account.security": "账户安全与会话",
    "account.currentPassword": "当前密码",
    "account.newPassword": "新密码",
    "account.confirmNewPassword": "确认新密码",
    "account.changePassword": "修改密码",
    "account.passwordChanged": "密码已修改，已撤销 {count} 个其他登录会话。",
    "account.passwordChangeFailed": "无法修改密码：{message}",
    "account.passwordMismatch": "两次输入的新密码不一致。",
    "account.passwordTooShort": "新密码至少需要 8 个字符。",
    "account.currentPasswordInvalid": "当前密码不正确。",
    "account.sessions": "登录会话",
    "account.refreshSessions": "刷新会话",
    "account.sessionsUpdated": "登录会话已刷新。",
    "account.sessionsLoadFailed": "无法加载登录会话：{message}",
    "account.revokeOtherSessions": "退出其他设备",
    "account.revokeOtherSessionsTitle": "退出其他设备？",
    "account.revokeOtherSessionsMessage": "这会撤销除当前设备外的所有登录会话。其他设备需要重新登录。",
    "account.revokeOtherSessionsConfirm": "退出其他设备",
    "account.otherSessionsRevoked": "已撤销 {count} 个其他登录会话。",
    "account.noSessions": "没有可显示的登录会话。",
    "account.currentSession": "当前设备",
    "account.unknownDevice": "未命名设备",
    "account.revokeSession": "撤销此会话",
    "account.revokeSessionTitle": "撤销此设备会话？",
    "account.revokeSessionMessage": "撤销“{device}”的登录会话后，该设备需要重新登录。",
    "account.revokeSessionConfirm": "撤销会话",
    "account.sessionRevoked": "会话已撤销。",
    "account.sessionCreated": "登录：{time}",
    "account.sessionExpires": "到期：{time}",
    "notification.title": "任务提醒",
    "notification.enable": "开启系统通知",
    "notification.enabled": "系统通知已开启。页面打开时会按提醒时间发送；没有提醒时间时使用截止时间。",
    "notification.denied": "系统通知权限已被浏览器阻止。请在站点设置中允许后重试；当前不会声称已提醒。",
    "notification.unsupported": "当前浏览器不支持系统通知。任务时间仍会保留，但不会声称已提醒。",
    "notification.insecureContext": "当前页面不是安全连接，浏览器不会发送系统通知。请使用 HTTPS 打开后重试；当前不会声称已提醒。",
    "notification.closedAppLimit": "页面打开时可按提醒或截止时间通知；关闭浏览器后的提醒取决于系统与 PWA 支持。",
    "notification.upcomingScheduled": "已为 {count} 条即将到期的任务安排页面内提醒。",
    "notification.noUpcoming": "系统通知已开启，目前没有未来的提醒或截止时间。",
    "notification.taskBody": "{title}",
    "notification.failed": "浏览器未能发送系统通知，当前不会声称已提醒。请检查站点通知权限。",
    "app.mobileQuickActions": "常用操作",
    "app.refresh": "刷新",
    "app.user": "用户",
    "app.supportDataTools": "同步问题",
    "app.diagnostics": "技术信息（排查时使用）",
    "app.apiAddress": "接口地址",
    "app.deviceId": "设备标识",
    "app.clientErrorReporting": "允许发送浏览器错误用于排障",
    "app.clientErrorReportingHint": "开启后，浏览器错误会发送用于排障；上报内容包含应用版本、页面路径、浏览器类型和脱敏后的错误堆栈，不包含密码、令牌或完整链接参数。",
    "app.localData": "数据与备份",
    "app.localDataHint": "导出或导入这台设备的离线任务备份。清除此设备数据只会删除本机缓存和登录状态，不会删除服务器上的任务。",
    "app.localDataSafetyHint": "清除前先确认没有待同步、同步失败或冲突的任务；不确定时先导出本机备份。",
    "app.exportLocalBackup": "导出本机备份",
    "app.importLocalBackup": "导入本机备份",
    "app.undoLocalBackupImport": "撤销上次导入",
    "app.clearLocalData": "清除此设备数据",
    "app.localDataRequiresLogin": "请先登录后再管理本机数据。",
    "app.localDataRequiresIndexedDb": "当前浏览器不支持本机离线数据库，无法执行此操作。",
    "app.localDataUnavailable": "浏览器本地存储暂不可用。请检查隐私模式、站点权限或浏览器存储空间后重试。",
    "app.localBackupNoTasks": "这台设备当前没有可导出的本机任务。",
    "app.localBackupExported": "已导出 {count} 条本机任务备份。",
    "app.localBackupUnsupported": "备份格式不受支持。",
    "app.localBackupInvalid": "无法读取备份文件，请确认它是 TaskBridge 导出的 JSON 文件。",
    "app.localBackupTooLarge": "备份文件过大，请换用较小的备份文件。",
    "app.localBackupImportTitle": "导入本机备份？",
    "app.localBackupImportMessage": "将导入 {count} 条任务并等待同步；已跳过 {skipped} 条无效记录。只能撤销最近一次安全导入，已同步到服务器的任务需要手动删除。继续吗？",
    "app.localBackupImportConfirm": "导入备份",
    "app.localBackupImported": "已导入 {count} 条任务，等待同步。",
    "app.localBackupImportUndoUnavailable": "只能撤销最近一次安全导入；这次任务已导入到服务器，无法一键撤销。若导错，请在任务列表中手动删除不需要的任务。",
    "app.localBackupImportNothing": "没有可导入的有效任务。",
    "app.localBackupUndoTitle": "撤销上次导入？",
    "app.localBackupUndoMessage": "只能撤销最近一次安全导入。本次将删除从该次备份导入、且尚未同步到服务器的 {count} 条任务。",
    "app.localBackupUndoConfirm": "撤销导入",
    "app.localBackupUndoNothing": "没有可撤销的本机导入。",
    "app.localBackupUndone": "已撤销上次导入的 {count} 条任务。",
    "app.clearLocalDataTitle": "清除此设备数据？",
    "app.clearLocalDataMessage": "这会退出登录，并删除当前账号在本浏览器中的离线任务、等待同步的修改和本机缓存。服务器上的任务不会被删除。建议先导出本机备份。",
    "app.clearLocalDataConfirm": "清除此设备数据",
    "app.localDataCleared": "已清除此设备数据。",
    "app.localDataClearedRevocationUnconfirmed": "本机数据已清除并已退出，但服务器未确认撤销此会话。网络恢复后请重新登录并检查登录设备。",
    "app.localDataClearWaiting": "正在等待其他 TaskBridge 标签页关闭本机数据库，关闭后会自动继续。",
    "app.syncStatus": "同步状态",
    "app.syncDetails": "同步详情",
    "app.syncAdvancedDiagnostics": "同步详情",
    "app.openSyncSupport": "查看同步详情",
    "app.syncNextStep": "下一步：继续记录任务，TaskBridge 会自动同步。",
    "app.syncDecision": "只要这里没有显示待同步、失败或冲突，你通常不需要手动处理。",
    "app.views": "视图",
    "app.stats": "统计",
    "app.settingsSupport": "设置与支持",
    "app.closeSettingsSupport": "关闭设置与支持",
    "task.newTask": "新建任务",
    "task.backToNewTask": "回到新建任务",
    "task.quickAdd": "快速添加任务",
    "task.quickCreate": "添加",
    "task.openAdvancedEditor": "详细编辑",
    "task.closeEditor": "关闭编辑器",
    "task.createCollapsedHint": "直接填写标题即可，备注、清单和时间安排可稍后展开。",
    "task.title": "标题",
    "task.quickPlaceholder": "例如：写周报",
    "task.bodyDetails": "添加备注和清单",
    "task.arrangementSettings": "时间与安排",
    "task.moreSettings": "更多：标签、重复、模板",
    "task.content": "备注",
    "task.project": "项目",
    "task.tag": "标签",
    "task.priority": "优先级",
    "task.priorityNone": "无优先级",
    "task.priorityLow": "低",
    "task.priorityMedium": "中",
    "task.priorityHigh": "高",
    "task.priorityUrgent": "紧急",
    "task.priorityHighest": "最高",
    "task.list": "归类",
    "task.listInbox": "收件箱",
    "task.listToday": "今日",
    "task.plannedDate": "计划日期",
    "task.dueTime": "截止时间",
    "task.remindTime": "提醒时间",
    "task.scheduleHelp": "计划日期表示哪天要做；截止时间表示最晚完成时间；提醒时间只负责通知。",
    "task.repeat": "重复",
    "task.repeatNone": "不重复",
    "task.repeatDaily": "每天",
    "task.repeatWeekly": "每周",
    "task.repeatMonthly": "每月",
    "task.steps": "清单",
    "task.stepsPlaceholder": "每行一个清单项",
    "task.stepsHint": "用于拆分任务，已完成的清单项会在编辑时尽量保留。",
    "task.saveAsTemplate": "保存为模板",
    "task.templateName": "模板名称",
    "task.create": "创建",
    "task.newTaskShortcut": "新建任务",
    "task.taskListShortcut": "任务列表",
    "task.saveChanges": "保存更改",
    "task.reset": "重置",
    "task.resetCurrent": "重置当前",
    "task.cancelEdit": "取消编辑",
    "task.tasks": "任务",
    "task.search": "搜索",
    "task.searchPlaceholder": "标题、内容、项目、标签",
    "task.clearSearch": "清空",
    "task.currentFilters": "当前筛选",
    "task.clearFilters": "清空筛选",
    "task.syncHealthReady": "当前无需处理，继续记录任务，TaskBridge 会自动同步。",
    "task.syncHealthNeedsReview": "有 {count} 条任务待同步、失败或冲突。清除此设备数据前请先打开同步详情处理。",
    "task.syncHealthUnknown": "尚未刷新同步状态。离线时也可以继续记录任务，联网后会自动同步。",
    "task.syncHealthDegraded": "实时更新暂不可用，任务仍会正常保存并通过常规同步更新。",
    "task.searchFilter": "搜索 {query}",
    "task.edit": "编辑",
    "task.complete": "完成",
    "task.undoComplete": "撤销完成",
    "task.delete": "删除",
    "task.moreActions": "操作",
    "task.expandNote": "展开备注",
    "task.collapseNote": "收起备注",
    "task.moreActionsFor": "操作：{title}",
    "task.bulkActions": "批量操作",
    "task.exitSelection": "取消批量操作",
    "task.selectAllVisible": "选择当前列表",
    "task.completeSelected": "完成所选",
    "task.deleteSelected": "删除所选",
    "task.selectedCompleted": "所选任务已完成",
    "task.selectedDeleted": "所选任务已删除",
    "task.selectTaskFor": "选择任务：{title}",
    "task.planToday": "安排到今天",
    "task.planTomorrow": "安排到明天",
    "task.snoozeLater": "稍后一小时",
    "task.useTemplate": "使用模板",
    "task.restore": "恢复",
    "task.purge": "永久删除",
    "task.select": "选择",
    "task.selectTask": "选择任务",
    "task.selectedCount": "已选择 {count} 项",
    "task.clearSelection": "清除选择",
    "task.restoreSelectedTrash": "恢复所选",
    "task.purgeSelectedTrash": "永久删除所选",
    "task.updated": "任务已更新",
    "task.saved": "任务已保存",
    "task.created": "任务已创建",
    "task.createdFromTemplate": "已从模板创建任务",
    "task.restored": "任务已恢复",
    "task.purged": "任务已永久删除",
    "task.selectedRestored": "所选任务已恢复",
    "task.selectedPurged": "所选任务已永久删除",
    "task.purgeRequiresConnection": "这条任务已经同步到服务器，需要联网后才能永久删除。",
    "task.canceledEdit": "已取消编辑",
    "task.editing": "编辑中：{title}",
    "task.refreshedRetry": "任务已刷新，请重新操作",
    "task.updatedElsewhere": "任务已被其他设备更新",
    "task.refreshBeforeSaving": "{message}。请刷新任务后再保存",
    "task.emptySearchTitle": "没有匹配任务",
    "task.emptyViewTitle": "{view}暂无任务",
    "task.emptySearchHint": "清空搜索或调整关键词。",
    "task.emptyViewHint": "可以先输入一个标题，例如：写周报。需要时再加时间、标签或优先级。",
    "task.emptyFilteredHint": "清除筛选后可以查看已有任务；新建时先输入标题，例如：写周报。",
    "task.clearFilter": "查看全部任务",
    "task.untitled": "未命名任务",
    "task.thisTask": "该任务",
    "task.items": "{count} 项",
    "task.summary": "{view} · {count} 条{search}{queue}",
    "task.summarySearch": " · 搜索 {query}",
    "task.summaryQueue": " · 等待同步 {count}",
    "task.offlineCachedSyncLater": "当前为离线缓存数据，恢复网络后会自动同步",
    "task.offlineCached": "当前为离线缓存数据",
    "task.offlineLimitNotice": "离线缓存中当前筛选共有 {total} 条任务，列表先显示前 {visible} 条。可继续显示更多，或清空搜索、切换筛选缩小范围。",
    "task.offlineLimitLoadMore": "显示更多离线任务",
    "task.savedPendingSync": "已保存到本机，等待同步",
    "task.savedSignInToSync": "已保存到本机，登录后同步",
    "task.projectPreview": "项目 {value}",
    "task.tagPreview": "标签 {value}",
    "task.planPreview": "计划 {value}",
    "task.duePreview": "截止 {value}",
    "task.reminderPreview": "提醒 {value}",
    "task.snoozePreview": "稍后 {value}",
    "task.completedPreview": "完成 {value}",
    "task.checklistPreview": "清单 {count} 项",
    "task.statusConflict": "同步冲突",
    "task.statusSyncFailed": "同步失败",
    "task.statusPendingSync": "待同步",
    "task.retrySync": "重试同步",
    "task.discardSync": "放弃本机修改",
    "task.retryingSync": "正在重试这条任务的同步。",
    "task.discardSyncTitle": "放弃本机修改？",
    "task.discardSyncMessage": "这会删除这条任务尚未同步的本机修改。需要保留内容时，请先导出本机备份。",
    "task.discardLocalCreateMessage": "这条任务从未同步到服务器，放弃后会从这台设备删除。需要保留内容时，请先导出本机备份。",
    "task.discardSyncConfirm": "放弃本机修改",
    "task.syncDiscarded": "已放弃本机修改。",
    "task.statusDeleted": "已删除",
    "task.statusCompleted": "已完成",
    "task.statusInProgress": "进行中",
    "view.all": "全部",
    "view.today": "今日",
    "view.inbox": "收件箱",
    "view.week": "本周",
    "view.project": "项目",
    "view.tag": "标签",
    "view.allProjects": "全部项目",
    "view.allTags": "全部标签",
    "view.overdue": "逾期",
    "view.high": "高优先级",
    "view.pending": "待同步",
    "view.conflict": "有冲突",
    "view.completed": "已完成",
    "view.templates": "模板",
    "view.trash": "回收站",
    "view.moreFilters": "列表与状态",
    "meta.open": "未完成",
    "meta.stats": "统计",
    "sync.readyLabel": "同步正常",
    "sync.degradedLabel": "实时更新受限",
    "sync.readyAction": "任务会自动同步到其他设备。",
    "sync.degradedAction": "实时更新暂不可用，任务仍会通过常规同步更新到其他设备。",
    "sync.nextStepReady": "下一步：继续记录任务，TaskBridge 会自动同步。",
    "sync.nextStepNeedsCheck": "下一步：打开同步详情，处理失败或冲突后再清除本机数据。",
    "sync.nextStepUnknown": "下一步：刷新同步状态；离线时可以继续记录任务，联网后会同步。",
    "sync.nextStepSignIn": "下一步：联网后登录并同步。",
    "sync.noStatus": "尚未检查同步状态。",
    "sync.action": "处理建议",
    "sync.service": "服务状态",
    "sync.serverTime": "服务器时间",
    "sync.limits": "同步限制",
    "sync.serviceAvailable": "服务可用",
    "sync.serviceNeedsCheck": "部分能力需检查",
    "sync.normal": "正常",
    "sync.partiallyDegraded": "部分异常",
    "sync.unavailable": "异常",
    "sync.pullLimit": "拉取",
    "sync.pushLimit": "上传",
    "sync.pageLimit": "单页",
    "sync.maxPages": "最大页数",
    "sync.limit": "限制",
    "confirm.title": "确认操作",
    "confirm.message": "确认继续吗？",
    "confirm.confirm": "确认",
    "confirm.cancel": "取消",
    "confirm.deleteTaskTitle": "删除任务？",
    "confirm.deleteTaskMessage": "确认删除{title}？删除后可以在回收站恢复。",
    "confirm.deleteSelectedTitle": "删除所选任务？",
    "confirm.deleteSelectedMessage": "确认删除 {count} 个所选任务？删除后可以在回收站恢复。",
    "confirm.purgeTaskTitle": "永久删除任务？",
    "confirm.purgeTaskMessage": "确认永久删除{title}？此操作不能从回收站恢复。",
    "confirm.purgeSelectedTitle": "永久删除所选任务？",
    "confirm.purgeSelectedMessage": "确认永久删除 {count} 个所选任务？此操作不能从回收站恢复。",
    "confirm.clearDraftTitle": "清空任务草稿？",
    "confirm.clearDraft": "清空当前任务草稿吗？标题、备注、清单和时间都会被清除。",
    "confirm.clear": "清空",
    "checklist.empty": "还没有清单项",
    "checklist.delete": "删除",
    "sync.useServer": "保留同步来的版本",
    "sync.overwriteServer": "保留这台设备版本",
    "sync.conflictMessage": "这条任务在另一台设备也改过。先比较差异，再选择保留哪一份。",
    "sync.noServerVersion": "这条本机任务还没有同步来的版本。你可以复制内容后重新创建，或放弃这条本机修改。",
    "sync.localVersion": "这台设备",
    "sync.serverVersion": "同步来的版本",
    "sync.untitledTask": "未命名任务",
    "sync.previewUnavailable": "暂不可预览",
    "sync.differences": "差异",
    "sync.differencesUnavailable": "未检测到可展示的字段差异，请根据两侧版本信息选择保留哪一版。",
    "sync.content": "内容",
    "sync.due": "截止",
    "sync.plan": "计划",
    "sync.reminder": "提醒",
    "sync.repeat": "重复",
    "sync.tag": "标签",
    "sync.project": "项目",
    "sync.checklist": "清单",
    "sync.useServerUnavailable": "这条冲突没有可保留的同步来的版本",
    "sync.useServerTitle": "保留同步来的版本？",
    "sync.useServerMessage": "保留「{title}」同步来的版本？这台设备上未同步的修改会被放弃。",
    "sync.useServerConfirm": "保留同步来的版本",
    "sync.useServerDone": "已保留同步来的版本",
    "sync.useServerConsequence": "会放弃这台设备上未同步的修改。",
    "sync.overwriteServerUnavailable": "这条冲突暂时不能保留这台设备版本",
    "sync.overwriteServerTitle": "保留这台设备版本？",
    "sync.overwriteServerMessage": "保留这台设备上的「{title}」？同步后其他设备会看到这个版本。",
    "sync.overwriteServerConfirm": "保留这台设备版本",
    "sync.overwriteServerDone": "已保留这台设备版本",
    "sync.overwriteServerConsequence": "同步后，其他设备会看到这台设备上的版本。",
    "sync.failedMessage": "这条任务同步失败。你可以重试，或在确认不再需要本机修改后放弃。",
    "sync.retryFailed": "重试同步",
    "sync.discardFailed": "放弃本机修改",
    "sync.retrying": "正在重试同步...",
    "sync.retryDone": "已重试同步队列。",
    "sync.discardTitle": "放弃这条本机修改？",
    "sync.discardMessage": "放弃“{title}”会删除尚未同步的本机修改。需要保留时，请先取消并导出本机备份。",
    "sync.discardConfirm": "放弃本机修改",
    "sync.discarded": "已放弃本机修改。",
    "sync.discardNeedsConnection": "这条任务已有服务器版本，需要联网后才能安全放弃本机修改。",
    "sync.noFailedMutation": "没有找到可重试的失败记录。",
    "sync.statusUnavailable": "暂时无法获取同步状态，请稍后重试；若持续失败，请联系管理员。",
    "connection.offlineAvailable": "离线可用",
    "connection.localMode": "本机模式",
    "connection.offlineDisconnected": "离线，未连接服务器",
    "connection.connected": "服务器已连接",
    "connection.needsCheck": "实时更新受限",
    "connection.unchecked": "服务器未检查",
    "connection.disconnected": "服务器未连接",
    "connection.awaitingLogin": "等待登录",
    "connection.pendingSync": "待同步 {count}",
    "connection.availableExistingLogin": "连接可用，请使用已有账号登录。",
    "validation.accountRequired": "请输入账号或邮箱。",
    "validation.usernameRequired": "请输入用户名。",
    "validation.emailRequired": "请输入邮箱。",
    "validation.passwordRequired": "请输入密码。",
    "validation.passwordMinLength": "密码至少需要 8 位。",
    "validation.taskTitleRequired": "请输入任务标题。",
    "validation.serverUrlRequired": "请输入服务器地址。",
    "validation.apiUrlRequired": "请输入请求地址，或清空后由服务器地址重新生成。",
    "validation.serverUrlInvalid": "请输入有效的服务器地址，例如 http://127.0.0.1:8080。",
    "validation.serverUrlProtocol": "服务器地址需要以 http:// 或 https:// 开头。",
    "validation.mixedContentApi": "当前页面使用 HTTPS，浏览器会阻止连接 HTTP 服务器。请改用 HTTPS 服务地址、同源反向代理，或通过 HTTP 打开此页面。",
    "error.authInvalidCredentials": "账号或密码不正确，请检查后重试。",
    "error.authForbidden": "当前账号无权访问此服务，请联系管理员确认权限或注册开关。",
    "error.loginServiceNotFound": "没有找到登录服务，请联系管理员检查部署配置。",
    "error.serverUnavailableWithLocalData": "服务器暂时不可用，请稍后重试。已保存的本地数据不会被删除。",
    "error.connectionServiceUnavailable": "无法连接服务，请检查网络；若持续失败，请联系管理员。",
    "error.authFallback": "{message}。请检查账号和密码，或联系管理员。",
    "error.generic": "操作失败，请稍后重试",
    "error.versionConflict": "这条任务已被其他设备修改，请刷新后再保存。",
    "error.unsupportedRepeatRule": "当前重复规则暂不支持，请改成每天、每周或每月。",
    "error.sessionExpired": "登录状态已失效，请重新登录。",
    "error.taskNotFound": "没有找到这条任务，可能已在其他设备删除。",
    "error.serverUnavailable": "服务器暂时不可用，请稍后重试。",
    "error.connectionServerUnavailable": "无法连接服务，请检查网络或联系管理员。",
    "error.requestFailed": "请求失败",
  },
  "en-US": {
    "brand.tagline": "Cross-device tasks",
    "language.label": "Language",
    "common.submitting": "Submitting...",
    "install.action": "Install help",
    "install.installApp": "Install app",
    "install.installed": "App installed",
    "install.title": "Install TaskBridge",
    "install.defaultHelp": "Choose the install entry for your current browser.",
    "install.close": "Close",
    "install.alreadyInstalled": "TaskBridge is already open as an installed app.",
    "install.iosSafari": "In Safari, tap Share, then choose Add to Home Screen.",
    "install.androidChrome": "In Chrome, open the top-right menu and choose Install app or Add to Home screen.",
    "install.edge": "In Edge, use the address bar or menu Apps entry, then install this site as an app.",
    "install.chrome": "In Chrome, click the install icon in the address bar or choose Install TaskBridge from the top-right menu.",
    "install.generic": "This browser may not show an install button. Pin a bookmark, or open TaskBridge in Chrome, Edge, or Safari to install it.",
    "install.insecureContext": "Regular HTTP and WS still work, but this connection cannot install the PWA or cache offline pages. Use HTTPS, or open localhost on the server computer.",
    "startup.title": "Page resources need a refresh",
    "startup.message": "If the page does not respond for a while, the browser may still be using old page resource cache. Refreshing will not delete local tasks.",
    "startup.reload": "Refresh page",
    "startup.clearAndReload": "Clear page resource cache and refresh",
    "sync.status": "Sync status",
    "auth.logout": "Log out",
    "auth.signInToSync": "Sign in to sync",
    "auth.resumeOffline": "Continue offline",
    "auth.resumeOfflineHint": "Open tasks previously synced on this device. Sign in again before syncing online.",
    "auth.offlineModeActive": "Using tasks stored on this device. Changes stay local until you sign in to sync.",
    "auth.offlineProfileUnavailable": "No offline profile is available. Sign in online once first.",
    "auth.loggedIn": "Signed in",
    "auth.loginSuccess": "Signed in",
    "auth.eyebrow": "Cross-device tasks",
    "auth.title": "Sign in to TaskBridge",
    "auth.modeLabel": "Sign-in mode",
    "auth.login": "Log in",
    "auth.register": "Register",
    "auth.username": "Username",
    "auth.email": "Email",
    "auth.account": "Account",
    "auth.password": "Password",
    "auth.forgotPasswordHelp": "Forgot your password? Ask the server administrator to reset it.",
    "auth.showPassword": "Show password",
    "auth.hidePassword": "Hide password",
    "auth.registrationPending": "Click Register to check automatically whether this server allows registration. Existing accounts can still sign in.",
    "auth.registrationCheckFailed": "Registration availability could not be checked. Try again later or contact the administrator. Existing accounts can sign in.",
    "auth.registrationEnabled": "This server allows open registration. You can create an account.",
    "auth.registrationDisabled": "Registration is disabled on this server. Sign in with an existing account or ask the server administrator to create one.",
    "auth.logoutTitle": "Log out?",
    "auth.logoutConfirm": "Log out anyway",
    "auth.loggedOut": "Logged out",
    "auth.loggedOutRevocationUnconfirmed": "Signed out on this device, but the server did not confirm session revocation. Sign in again after the connection recovers and check your active sessions.",
    "auth.logoutPendingWarning": "There are unsynced, failed, or conflicting tasks. Local cache will remain after logout, but other devices may not see these changes yet. Continue?",
    "app.account": "Account",
    "account.security": "Account security and sessions",
    "account.currentPassword": "Current password",
    "account.newPassword": "New password",
    "account.confirmNewPassword": "Confirm new password",
    "account.changePassword": "Change password",
    "account.passwordChanged": "Password changed. {count} other sign-in sessions were revoked.",
    "account.passwordChangeFailed": "Could not change password: {message}",
    "account.passwordMismatch": "The new password entries do not match.",
    "account.passwordTooShort": "The new password must be at least 8 characters.",
    "account.currentPasswordInvalid": "The current password is incorrect.",
    "account.sessions": "Sign-in sessions",
    "account.refreshSessions": "Refresh sessions",
    "account.sessionsUpdated": "Sign-in sessions refreshed.",
    "account.sessionsLoadFailed": "Could not load sign-in sessions: {message}",
    "account.revokeOtherSessions": "Sign out other devices",
    "account.revokeOtherSessionsTitle": "Sign out other devices?",
    "account.revokeOtherSessionsMessage": "This revokes every sign-in session except this device. Other devices must sign in again.",
    "account.revokeOtherSessionsConfirm": "Sign out other devices",
    "account.otherSessionsRevoked": "Revoked {count} other sign-in sessions.",
    "account.noSessions": "No sign-in sessions are available.",
    "account.currentSession": "Current device",
    "account.unknownDevice": "Unnamed device",
    "account.revokeSession": "Revoke this session",
    "account.revokeSessionTitle": "Revoke this device session?",
    "account.revokeSessionMessage": "After revoking the sign-in session for “{device}”, that device must sign in again.",
    "account.revokeSessionConfirm": "Revoke session",
    "account.sessionRevoked": "Session revoked.",
    "account.sessionCreated": "Signed in: {time}",
    "account.sessionExpires": "Expires: {time}",
    "notification.title": "Task reminders",
    "notification.enable": "Enable system notifications",
    "notification.enabled": "System notifications are enabled. While this page is open, reminder time is used first and due time is the fallback.",
    "notification.denied": "System notifications are blocked by the browser. Allow them in site settings and try again; TaskBridge will not claim a reminder was sent.",
    "notification.unsupported": "This browser does not support system notifications. Task times remain saved, but TaskBridge will not claim a reminder was sent.",
    "notification.insecureContext": "This page is not using a secure connection, so the browser will not send system notifications. Open it over HTTPS and try again; TaskBridge will not claim a reminder was sent.",
    "notification.closedAppLimit": "Reminders can fire while this page is open. Closed-browser delivery depends on system and PWA support.",
    "notification.upcomingScheduled": "Scheduled in-page reminders for {count} upcoming tasks.",
    "notification.noUpcoming": "System notifications are enabled. There are no future reminder or due times.",
    "notification.taskBody": "{title}",
    "notification.failed": "The browser could not send a system notification. TaskBridge will not claim a reminder was sent. Check this site's notification permission.",
    "app.mobileQuickActions": "Common actions",
    "app.refresh": "Refresh",
    "app.user": "User",
    "app.supportDataTools": "Sync issues",
    "app.diagnostics": "Technical information (for troubleshooting)",
    "app.apiAddress": "API address",
    "app.deviceId": "Device ID",
    "app.clientErrorReporting": "Allow browser error reports for troubleshooting",
    "app.clientErrorReportingHint": "When enabled, browser errors are sent for troubleshooting. Reports include app version, page path, browser type, and a sanitized stack trace, but not passwords, tokens, or full URL parameters.",
    "app.localData": "Data and backups",
    "app.localDataHint": "Export or import this device's offline task backup. Clearing this device only removes local cache and sign-in state, not server tasks.",
    "app.localDataSafetyHint": "Before clearing, check that there are no pending, failed, or conflicting tasks. Export a local backup if unsure.",
    "app.exportLocalBackup": "Export local backup",
    "app.importLocalBackup": "Import local backup",
    "app.undoLocalBackupImport": "Undo last import",
    "app.clearLocalData": "Clear this device",
    "app.localDataRequiresLogin": "Sign in before managing local data.",
    "app.localDataRequiresIndexedDb": "This browser does not support the local offline database.",
    "app.localDataUnavailable": "Browser local storage is unavailable. Check private browsing, site permissions, or available storage, then try again.",
    "app.localBackupNoTasks": "There are no local tasks to export on this device.",
    "app.localBackupExported": "Exported {count} local tasks.",
    "app.localBackupUnsupported": "This backup format is not supported.",
    "app.localBackupInvalid": "Could not read the backup file. Use a JSON file exported by TaskBridge.",
    "app.localBackupTooLarge": "The backup file is too large. Use a smaller backup file.",
    "app.localBackupImportTitle": "Import local backup?",
    "app.localBackupImportMessage": "{count} tasks will be imported and queued for sync; {skipped} invalid records were skipped. Only the most recent safe import can be undone, and tasks already synced to the server must be deleted manually. Continue?",
    "app.localBackupImportConfirm": "Import backup",
    "app.localBackupImported": "Imported {count} tasks and queued them for sync.",
    "app.localBackupImportUndoUnavailable": "Only the most recent safe import can be undone; these tasks have already reached the server, so they cannot be undone in one step. Delete unwanted tasks manually if needed.",
    "app.localBackupImportNothing": "No valid tasks were found to import.",
    "app.localBackupUndoTitle": "Undo last import?",
    "app.localBackupUndoMessage": "Only the most recent safe import can be undone. This will delete {count} tasks from that backup import that have not synced to the server yet.",
    "app.localBackupUndoConfirm": "Undo import",
    "app.localBackupUndoNothing": "There is no local import to undo.",
    "app.localBackupUndone": "Undid the last import and removed {count} tasks.",
    "app.clearLocalDataTitle": "Clear this device's data?",
    "app.clearLocalDataMessage": "This logs out and deletes this account's offline tasks, waiting-to-sync changes, and local cache in this browser. Server tasks will not be deleted. Export a local backup first if needed.",
    "app.clearLocalDataConfirm": "Clear this device",
    "app.localDataCleared": "This device's local data was cleared.",
    "app.localDataClearedRevocationUnconfirmed": "This device's data was cleared and you were signed out, but the server did not confirm session revocation. Sign in again after the connection recovers and check your active sessions.",
    "app.localDataClearWaiting": "Waiting for another TaskBridge tab to close the local database. It will continue automatically.",
    "app.syncStatus": "Sync status",
    "app.syncDetails": "Sync details",
    "app.syncAdvancedDiagnostics": "Sync details",
    "app.openSyncSupport": "View sync details",
    "app.syncNextStep": "Next step: keep adding tasks. TaskBridge will sync automatically.",
    "app.syncDecision": "If this area shows no pending, failed, or conflicting tasks, you usually do not need to do anything.",
    "app.views": "Views",
    "app.stats": "Stats",
    "app.settingsSupport": "Settings and support",
    "app.closeSettingsSupport": "Close settings and support",
    "task.newTask": "New task",
    "task.backToNewTask": "Back to new task",
    "task.quickAdd": "Quick add task",
    "task.quickCreate": "Add",
    "task.openAdvancedEditor": "Detailed editor",
    "task.closeEditor": "Close editor",
    "task.createCollapsedHint": "Enter a title first. Notes, checklist, and scheduling can wait.",
    "task.title": "Title",
    "task.quickPlaceholder": "Example: write weekly report",
    "task.bodyDetails": "Add notes and checklist",
    "task.arrangementSettings": "Time and schedule",
    "task.moreSettings": "More: tags, repeat, templates",
    "task.content": "Notes",
    "task.project": "Project",
    "task.tag": "Tag",
    "task.priority": "Priority",
    "task.priorityNone": "No priority",
    "task.priorityLow": "Low",
    "task.priorityMedium": "Medium",
    "task.priorityHigh": "High",
    "task.priorityUrgent": "Urgent",
    "task.priorityHighest": "Highest",
    "task.list": "Location",
    "task.listInbox": "Inbox",
    "task.listToday": "Today",
    "task.plannedDate": "Plan date",
    "task.dueTime": "Due time",
    "task.remindTime": "Reminder time",
    "task.scheduleHelp": "Plan date is when you intend to work on it; due time is the latest finish time; reminder only sends a notification.",
    "task.repeat": "Repeat",
    "task.repeatNone": "Does not repeat",
    "task.repeatDaily": "Daily",
    "task.repeatWeekly": "Weekly",
    "task.repeatMonthly": "Monthly",
    "task.steps": "Checklist",
    "task.stepsPlaceholder": "One checklist item per line",
    "task.stepsHint": "Use checklist items to break down the task. Completed items are preserved where possible when editing.",
    "task.saveAsTemplate": "Save as template",
    "task.templateName": "Template name",
    "task.create": "Create",
    "task.newTaskShortcut": "New task",
    "task.taskListShortcut": "Task list",
    "task.saveChanges": "Save changes",
    "task.reset": "Reset",
    "task.resetCurrent": "Reset current",
    "task.cancelEdit": "Cancel edit",
    "task.tasks": "Tasks",
    "task.search": "Search",
    "task.searchPlaceholder": "Title, content, project, tag",
    "task.clearSearch": "Clear",
    "task.currentFilters": "Current filters",
    "task.clearFilters": "Clear filters",
    "task.syncHealthReady": "No action needed. Keep adding tasks and TaskBridge will sync automatically.",
    "task.syncHealthNeedsReview": "{count} tasks are pending, failed, or conflicted. Open sync details before clearing this device.",
    "task.syncHealthUnknown": "Sync status has not refreshed yet. You can keep adding tasks offline and sync later.",
    "task.syncHealthDegraded": "Real-time updates are temporarily unavailable. Tasks still save normally and continue through regular sync.",
    "task.searchFilter": "Search {query}",
    "task.edit": "Edit",
    "task.complete": "Complete",
    "task.undoComplete": "Undo complete",
    "task.delete": "Delete",
    "task.moreActions": "Actions",
    "task.expandNote": "Expand note",
    "task.collapseNote": "Collapse note",
    "task.moreActionsFor": "Actions: {title}",
    "task.bulkActions": "Bulk actions",
    "task.exitSelection": "Cancel bulk actions",
    "task.selectAllVisible": "Select visible tasks",
    "task.completeSelected": "Complete selected",
    "task.deleteSelected": "Delete selected",
    "task.selectedCompleted": "Selected tasks completed",
    "task.selectedDeleted": "Selected tasks deleted",
    "task.selectTaskFor": "Select task: {title}",
    "task.planToday": "Plan for today",
    "task.planTomorrow": "Plan for tomorrow",
    "task.snoozeLater": "Later by one hour",
    "task.useTemplate": "Use template",
    "task.restore": "Restore",
    "task.purge": "Delete permanently",
    "task.select": "Select",
    "task.selectTask": "Select task",
    "task.selectedCount": "{count} selected",
    "task.clearSelection": "Clear selection",
    "task.restoreSelectedTrash": "Restore selected",
    "task.purgeSelectedTrash": "Delete selected permanently",
    "task.updated": "Task updated",
    "task.saved": "Task saved",
    "task.created": "Task created",
    "task.createdFromTemplate": "Task created from template",
    "task.restored": "Task restored",
    "task.purged": "Task permanently deleted",
    "task.selectedRestored": "Selected tasks restored",
    "task.selectedPurged": "Selected tasks permanently deleted",
    "task.purgeRequiresConnection": "This task has synced to the server. Go online before permanently deleting it.",
    "task.canceledEdit": "Edit canceled",
    "task.editing": "Editing: {title}",
    "task.refreshedRetry": "Tasks were refreshed. Try again.",
    "task.updatedElsewhere": "Task was updated on another device",
    "task.refreshBeforeSaving": "{message}. Refresh tasks before saving again.",
    "task.emptySearchTitle": "No matching tasks",
    "task.emptyViewTitle": "No tasks in {view}",
    "task.emptySearchHint": "Clear search or adjust keywords.",
    "task.emptyViewHint": "Start with a title, for example: write weekly report. Add time, tags, or priority only when needed.",
    "task.emptyFilteredHint": "Show all tasks to review existing work, or add a task with a plain title such as: write weekly report.",
    "task.clearFilter": "Show all tasks",
    "task.untitled": "Untitled task",
    "task.thisTask": "this task",
    "task.items": "{count} items",
    "task.summary": "{view} · {count} tasks{search}{queue}",
    "task.summarySearch": " · Search {query}",
    "task.summaryQueue": " · {count} pending",
    "task.offlineCachedSyncLater": "Showing offline cached data. Changes will sync when the network returns.",
    "task.offlineCached": "Showing offline cached data",
    "task.offlineLimitNotice": "The offline cache has {total} matching tasks. The list is showing the first {visible}. Show more, or clear search and change filters to narrow the list.",
    "task.offlineLimitLoadMore": "Show more offline tasks",
    "task.savedPendingSync": "Saved on this device, waiting to sync",
    "task.savedSignInToSync": "Saved on this device. Sign in to sync",
    "task.projectPreview": "Project {value}",
    "task.tagPreview": "Tag {value}",
    "task.planPreview": "Plan {value}",
    "task.duePreview": "Due {value}",
    "task.reminderPreview": "Reminder {value}",
    "task.snoozePreview": "Later {value}",
    "task.completedPreview": "Completed {value}",
    "task.checklistPreview": "{count} checklist items",
    "task.statusConflict": "Sync conflict",
    "task.statusSyncFailed": "Sync failed",
    "task.statusPendingSync": "Pending sync",
    "task.retrySync": "Retry sync",
    "task.discardSync": "Discard local changes",
    "task.retryingSync": "Retrying sync for this task.",
    "task.discardSyncTitle": "Discard local changes?",
    "task.discardSyncMessage": "This removes unsynced changes for this task. Export a local backup first if you need to keep the content.",
    "task.discardLocalCreateMessage": "This task was never synced. Discarding removes it from this device. Export a local backup first if you need the content.",
    "task.discardSyncConfirm": "Discard local changes",
    "task.syncDiscarded": "Local changes discarded.",
    "task.statusDeleted": "Deleted",
    "task.statusCompleted": "Completed",
    "task.statusInProgress": "In progress",
    "view.all": "All",
    "view.today": "Today",
    "view.inbox": "Inbox",
    "view.week": "This week",
    "view.project": "Project",
    "view.tag": "Tag",
    "view.allProjects": "All projects",
    "view.allTags": "All tags",
    "view.overdue": "Overdue",
    "view.high": "High priority",
    "view.pending": "Pending sync",
    "view.conflict": "Conflicts",
    "view.completed": "Completed",
    "view.templates": "Templates",
    "view.trash": "Recycle bin",
    "view.moreFilters": "Lists and status",
    "meta.open": "Open",
    "meta.stats": "Stats",
    "sync.readyLabel": "Sync ready",
    "sync.degradedLabel": "Real-time updates limited",
    "sync.readyAction": "Tasks will sync automatically to other devices.",
    "sync.degradedAction": "Real-time updates are temporarily unavailable. Tasks still sync to other devices through regular sync.",
    "sync.nextStepReady": "Next step: keep adding tasks. TaskBridge will sync automatically.",
    "sync.nextStepNeedsCheck": "Next step: open sync details, resolve failed items or conflicts, then clear this device only after it is clean.",
    "sync.nextStepUnknown": "Next step: refresh sync status. You can keep adding tasks offline; they will sync when the network returns.",
    "sync.nextStepSignIn": "Next step: sign in to sync when you are online.",
    "sync.noStatus": "Sync status has not been checked yet.",
    "sync.action": "Suggested action",
    "sync.service": "Service status",
    "sync.serverTime": "Server time",
    "sync.limits": "Sync limits",
    "sync.serviceAvailable": "Service available",
    "sync.serviceNeedsCheck": "Some capabilities need checking",
    "sync.normal": "Normal",
    "sync.partiallyDegraded": "Partially degraded",
    "sync.unavailable": "Unavailable",
    "sync.pullLimit": "Pull",
    "sync.pushLimit": "Push",
    "sync.pageLimit": "Page",
    "sync.maxPages": "Max pages",
    "sync.limit": "Limit",
    "confirm.title": "Confirm action",
    "confirm.message": "Continue?",
    "confirm.confirm": "Confirm",
    "confirm.cancel": "Cancel",
    "confirm.deleteTaskTitle": "Delete task?",
    "confirm.deleteTaskMessage": "Delete {title}? You can restore it from the recycle bin.",
    "confirm.deleteSelectedTitle": "Delete selected tasks?",
    "confirm.deleteSelectedMessage": "Delete {count} selected tasks? You can restore them from the recycle bin.",
    "confirm.purgeTaskTitle": "Permanently delete task?",
    "confirm.purgeTaskMessage": "Permanently delete {title}? This cannot be restored from the recycle bin.",
    "confirm.purgeSelectedTitle": "Permanently delete selected tasks?",
    "confirm.purgeSelectedMessage": "Permanently delete {count} selected tasks? This cannot be restored from the recycle bin.",
    "confirm.clearDraftTitle": "Clear task draft?",
    "confirm.clearDraft": "Clear the current task draft? Title, notes, checklist, and time fields will be removed.",
    "confirm.clear": "Clear",
    "checklist.empty": "No steps yet",
    "checklist.delete": "Delete",
    "sync.useServer": "Keep synced version",
    "sync.overwriteServer": "Keep this device",
    "sync.conflictMessage": "This task was also changed on another device. Compare the differences, then choose which version to keep.",
    "sync.noServerVersion": "This local task does not have a synced version yet. Copy its content and recreate it, or discard this local change.",
    "sync.localVersion": "This device",
    "sync.serverVersion": "Synced version",
    "sync.untitledTask": "Untitled task",
    "sync.previewUnavailable": "Preview unavailable",
    "sync.differences": "Differences",
    "sync.differencesUnavailable": "No displayable field differences were detected. Use the version details above to choose which version to keep.",
    "sync.content": "Content",
    "sync.due": "Due",
    "sync.plan": "Plan",
    "sync.reminder": "Reminder",
    "sync.repeat": "Repeat",
    "sync.tag": "Tag",
    "sync.project": "Project",
    "sync.checklist": "Checklist",
    "sync.useServerUnavailable": "There is no synced version available for this conflict.",
    "sync.useServerTitle": "Keep the synced version?",
    "sync.useServerMessage": "Keep the synced version of “{title}”? Unsynced changes on this device will be discarded.",
    "sync.useServerConfirm": "Keep synced version",
    "sync.useServerDone": "Synced version kept",
    "sync.useServerConsequence": "Discards unsynced changes on this device.",
    "sync.overwriteServerUnavailable": "This conflict cannot keep this device's version yet.",
    "sync.overwriteServerTitle": "Keep this device’s version?",
    "sync.overwriteServerMessage": "Keep this device’s version of “{title}”? Other devices will see this version after sync.",
    "sync.overwriteServerConfirm": "Keep this device",
    "sync.overwriteServerDone": "This device’s version kept",
    "sync.overwriteServerConsequence": "Other devices will see this device’s version after sync.",
    "sync.failedMessage": "This task failed to sync. Retry it, or discard the local change only when it is no longer needed.",
    "sync.retryFailed": "Retry sync",
    "sync.discardFailed": "Discard local change",
    "sync.retrying": "Retrying sync...",
    "sync.retryDone": "The sync queue was retried.",
    "sync.discardTitle": "Discard this local change?",
    "sync.discardMessage": "Discarding “{title}” removes its unsynced local changes. Cancel and export a local backup first if you need to keep them.",
    "sync.discardConfirm": "Discard local change",
    "sync.discarded": "Local change discarded.",
    "sync.discardNeedsConnection": "This task has a server version. Connect before discarding the local change safely.",
    "sync.noFailedMutation": "No failed queue record was found to retry.",
    "sync.statusUnavailable": "Sync status is unavailable. Try again later or contact the administrator if it continues.",
    "connection.offlineAvailable": "Offline available",
    "connection.localMode": "On-device mode",
    "connection.offlineDisconnected": "Offline, server not connected",
    "connection.connected": "Server connected",
    "connection.needsCheck": "Real-time updates limited",
    "connection.unchecked": "Server not checked",
    "connection.disconnected": "Server disconnected",
    "connection.awaitingLogin": "Waiting for sign-in",
    "connection.pendingSync": "{count} pending",
    "connection.availableExistingLogin": "Connection is available. Sign in with an existing account.",
    "validation.accountRequired": "Enter an account or email.",
    "validation.usernameRequired": "Enter a username.",
    "validation.emailRequired": "Enter an email.",
    "validation.passwordRequired": "Enter a password.",
    "validation.passwordMinLength": "Password must be at least 8 characters.",
    "validation.taskTitleRequired": "Enter a task title.",
    "validation.serverUrlRequired": "Enter the server address.",
    "validation.apiUrlRequired": "Enter the request URL, or leave it blank so it can be regenerated from the server address.",
    "validation.serverUrlInvalid": "Enter a valid server address, for example http://127.0.0.1:8080.",
    "validation.serverUrlProtocol": "Server address must start with http:// or https://.",
    "validation.mixedContentApi": "This page uses HTTPS, so the browser blocks an HTTP server. Use an HTTPS server address, a same-origin reverse proxy, or open this page over HTTP.",
    "error.authInvalidCredentials": "The account or password is incorrect. Check it and try again.",
    "error.authForbidden": "This account cannot access the service. Ask the administrator to check permissions or registration settings.",
    "error.loginServiceNotFound": "The login service was not found. Ask the administrator to check the deployment.",
    "error.serverUnavailableWithLocalData": "The server is temporarily unavailable. Try again later. Saved local data will not be deleted.",
    "error.connectionServiceUnavailable": "Cannot connect to the service. Check your network or contact the administrator.",
    "error.authFallback": "{message}. Check your account and password, or contact the administrator.",
    "error.generic": "Operation failed. Try again later.",
    "error.versionConflict": "This task was changed on another device. Refresh before saving again.",
    "error.unsupportedRepeatRule": "This repeat rule is not supported yet. Use daily, weekly, or monthly.",
    "error.sessionExpired": "Your session has expired. Sign in again.",
    "error.taskNotFound": "This task was not found. It may have been deleted on another device.",
    "error.serverUnavailable": "The server is temporarily unavailable. Try again later.",
    "error.connectionServerUnavailable": "Cannot connect to the service. Check your network or contact the administrator.",
    "error.requestFailed": "Request failed",
  },
};

Object.assign(I18N["zh-CN"], {
  "task.saveFailedFor": "无法保存“{title}”：{message}",
  "app.clearLocalDataBlocked": "当前还有待同步、同步失败或冲突的任务。请先在同步详情中处理，或先导出本机备份后再清除此设备数据。",
  "sync.useServer": "保留同步来的版本",
  "sync.overwriteServer": "保留这台设备版本",
});

Object.assign(I18N["en-US"], {
  "task.saveFailedFor": 'Could not save "{title}": {message}',
  "app.clearLocalDataBlocked": "This device still has pending, failed, or conflicting tasks. Handle them in sync details, or export a local backup before clearing this device.",
  "sync.useServer": "Keep synced version",
  "sync.overwriteServer": "Keep this device version",
});

const nodes = {};
let searchTimer = 0;
let refreshSessionPromise = null;
let sessionRefreshGeneration = 0;
let sessionActivationPromise = null;
let sessionActivationContext = null;
let sessionChannel = null;
const sessionCoordinatorId = crypto.randomUUID();
let offlineDbPromise = null;
let offlineDbNameInUse = "";
let localDataClearInProgress = false;
let offlineQueueFlushPromise = null;
let offlineQueueFlushContext = null;
let offlineResumeCheckSequence = 0;
let installPromptEvent = null;
let activeConfirm = null;
let lastImportedBackupTaskIds = [];
let notificationScheduleSequence = 0;
const taskRequestGate = createLatestRequestGate();
const connectionRequestGate = createLatestRequestGate();
const registrationRequestGate = createLatestRequestGate();
let workspaceMobileQuery = null;
let taskEditorReturnFocus = null;
let taskDraftFormKey = "";
let taskCreateRequestId = "";
let taskDraftSaveError = "";
let activeTaskMenu = null;
let taskMenuPositionScheduled = false;
let settingsSupportReturnFocus = null;
const notificationTimers = new Map();

class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

try {
  boot();
  markAppReady();
} catch (error) {
  showStartupFailure();
  throw error;
}

function markAppReady() {
  window.taskBridgeWebReady = true;
  const fallback = document.getElementById("startupFallback");
  if (fallback) {
    fallback.hidden = true;
  }
}

function showStartupFailure() {
  const fallback = document.getElementById("startupFallback");
  if (fallback) {
    fallback.hidden = false;
  }
}

function boot() {
  cacheNodes();
  alignWorkspaceDomOrder();
  restoreTaskListPreferences();
  if (state.notificationTaskId !== null) {
    state.view = "";
    state.search = "";
  }
  bindEvents();
  setupSessionCoordination();
  hydrateInputs();
  updateAuthMode();
  updateConnectionBadge();
  void refreshOfflineQueueCount();
  if (canAutoCheckRegistrationStatus()) {
    void loadRegistrationStatus();
  }
  registerLifecycleEvents();

  if (supportsServiceWorker()) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  if (hasSession() && shouldRestorePersistentSession()) {
    const sessionContext = captureSessionContext();
    void prepareOfflineProfileStorage()
      .catch(() => {})
      .finally(() => activateSessionSingleflight(sessionContext));
  } else {
    clearSession();
    render();
    void refreshOfflineResumeAvailability();
    if (shouldRestorePersistentSession()) {
      void restorePersistentSession();
    }
  }
}

function setupSessionCoordination() {
  if (typeof BroadcastChannel !== "function") return;
  sessionChannel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  sessionChannel.addEventListener("message", (event) => {
    void applySharedSessionMessage(event.data);
  });
  window.addEventListener("pagehide", () => {
    sessionChannel?.close();
    sessionChannel = null;
  }, { once: true });
}

async function applySharedSessionMessage(message) {
  if (
    !message ||
    message.source === sessionCoordinatorId ||
    message.apiBaseUrl !== state.apiBaseUrl ||
    message.deviceId !== state.deviceId
  ) {
    return;
  }

  if (message.type === "tokens") {
    const incomingUserId = Number(message.user?.id);
    const currentUserId = Number(state.user?.id);
    if (!Number.isFinite(incomingUserId) || incomingUserId <= 0) return;
    if (Number.isFinite(currentUserId) && currentUserId > 0 && currentUserId !== incomingUserId) return;
    if (!shouldRestorePersistentSession(incomingUserId)) return;
    const workspaceWasActive = hasLocalWorkspace();
    persistTokens(message, { broadcast: false });
    if (!workspaceWasActive) {
      const sessionContext = captureSessionContext();
      await prepareOfflineProfileStorage().catch(() => {});
      await activateSessionSingleflight(sessionContext);
    }
    return;
  }

  if (message.type === "signed-out") {
    const currentUserId = Number(state.user?.id);
    const signedOutUserId = Number(message.userId);
    if (
      Number.isFinite(currentUserId) &&
      currentUserId > 0 &&
      Number.isFinite(signedOutUserId) &&
      signedOutUserId > 0 &&
      currentUserId !== signedOutUserId
    ) {
      return;
    }
    const nextDeviceId = typeof message.nextDeviceId === "string"
      ? message.nextDeviceId.trim()
      : "";
    if (nextDeviceId && nextDeviceId.length <= 128) {
      state.deviceId = nextDeviceId;
      writeStoredString("deviceId", nextDeviceId);
    }
    suppressPersistentSession(message.userId);
    forgetOfflineProfile();
    clearSession();
    render();
    setStatus(nodes.authMessage, t("auth.loggedOut"));
  }
}

function broadcastSessionTokens(data) {
  if (!sessionChannel || !data?.access_token || !data?.refresh_token || !data?.user) return;
  sessionChannel.postMessage({
    type: "tokens",
    source: sessionCoordinatorId,
    apiBaseUrl: state.apiBaseUrl,
    deviceId: state.deviceId,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user,
  });
}

function broadcastSessionSignedOut({
  user = state.user,
  deviceId = state.deviceId,
  nextDeviceId = null,
} = {}) {
  sessionChannel?.postMessage({
    type: "signed-out",
    source: sessionCoordinatorId,
    apiBaseUrl: state.apiBaseUrl,
    deviceId,
    nextDeviceId,
    userId: user?.id ?? null,
  });
}

function cacheNodes() {
  for (const id of [
    "authScreen",
    "appScreen",
    "mainPanel",
    "sidebar",
    "mobileQuickActions",
    "settingsSupportButton",
    "settingsSupportBackdrop",
    "settingsSupportPanel",
    "settingsSupportCloseButton",
    "languageSelect",
    "authModeSwitch",
    "registrationGateHint",
    "authForm",
    "username",
    "email",
    "usernameOrEmail",
    "password",
    "togglePasswordVisibilityButton",
    "authSubmitButton",
    "authMessage",
    "offlineResumePanel",
    "resumeOfflineButton",
    "offlineResumeHint",
    "connectionBadge",
    "installAppButton",
    "installHelpPanel",
    "installHelpText",
    "installHelpCloseButton",
    "startupFallback",
    "confirmDialog",
    "confirmDialogTitle",
    "confirmDialogMessage",
    "confirmDialogConfirmButton",
    "confirmDialogCancelButton",
    "syncStatusButton",
    "logoutButton",
    "refreshAllButton",
    "accountSecurityTools",
    "passwordChangeForm",
    "currentPassword",
    "newPassword",
    "confirmNewPassword",
    "sessionList",
    "refreshSessionsButton",
    "revokeOtherSessionsButton",
    "accountSecurityMessage",
    "notificationPermissionButton",
    "notificationStatus",
    "supportDataTools",
    "userDisplay",
    "apiDisplay",
    "deviceDisplay",
    "clientErrorReportingToggle",
    "exportLocalBackupButton",
    "importLocalBackupInput",
    "undoLocalBackupImportButton",
    "clearLocalDataButton",
    "clearLocalDataBlockedHint",
    "localDataMessage",
    "syncBadge",
    "syncOverview",
    "syncSummary",
    "syncNextStep",
    "openSyncSupportButton",
    "syncAdvancedDiagnostics",
    "syncDetails",
    "viewButtons",
    "moreViewSelect",
    "projectFilter",
    "tagFilter",
    "metaCounts",
    "quickTaskForm",
    "quickTaskTitle",
    "quickTaskMessage",
    "openTaskCreateButton",
    "mobileQuickCreateButton",
    "mobileQuickTaskListButton",
    "taskCreateDetails",
    "taskListStack",
    "taskForm",
    "taskTitle",
    "taskQuickPreview",
    "taskBodyFields",
    "taskArrangementFields",
    "taskAdvancedFields",
    "taskContent",
    "taskProject",
    "taskTag",
    "taskPriority",
    "taskListType",
    "taskPlannedDate",
    "taskDueTime",
    "taskRemindTime",
    "taskRepeatRule",
    "taskChecklist",
    "taskChecklistItems",
    "taskIsTemplate",
    "taskTemplateNameField",
    "taskTemplateName",
    "taskSubmitButton",
    "resetTaskFormButton",
    "cancelEditButton",
    "taskSearch",
    "clearSearchButton",
    "taskSyncHealthBar",
    "taskSyncHealthText",
    "taskSyncHealthActionButton",
    "taskFilterSummary",
    "taskActiveFilterChips",
    "clearTaskFiltersButton",
    "taskSelectionToolbar",
    "enterTaskSelectionButton",
    "taskSelectionActions",
    "selectAllVisibleTasksButton",
    "completeSelectedTasksButton",
    "deleteSelectedTasksButton",
    "cancelTaskSelectionButton",
    "taskSelectionStatus",
    "taskSummary",
    "offlineTaskLimitNotice",
    "offlineTaskLimitText",
    "offlineTaskLimitLoadMoreButton",
    "taskList",
    "taskMessage",
    "toast",
  ]) {
    nodes[id] = document.getElementById(id);
  }
}

function alignWorkspaceDomOrder() {
  if (!nodes.appScreen || !nodes.mainPanel || !nodes.sidebar || !nodes.mobileQuickActions) return;
  workspaceMobileQuery = window.matchMedia("(max-width: 960px)");
  const applyOrder = () => {
    if (workspaceMobileQuery.matches) {
      nodes.appScreen.insertBefore(nodes.mainPanel, nodes.sidebar);
      nodes.appScreen.insertBefore(nodes.mobileQuickActions, nodes.mainPanel);
      return;
    }
    nodes.appScreen.insertBefore(nodes.sidebar, nodes.mainPanel);
    nodes.appScreen.insertBefore(nodes.mobileQuickActions, nodes.sidebar);
  };
  applyOrder();
  workspaceMobileQuery.addEventListener?.("change", applyOrder);
}

function bindEvents() {
  nodes.languageSelect?.addEventListener("change", () => {
    setLanguage(nodes.languageSelect.value);
  });

  nodes.authModeSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    void selectAuthMode(button.dataset.mode);
  });

  nodes.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    let sessionContext = null;
    try {
      setStatus(nodes.authMessage, t("common.submitting"));
      const payload = readAuthPayload();
      invalidateSessionRefreshes();
      sessionContext = captureSessionContext();
      const data = state.authMode === "login" ? await login(payload) : await register(payload);
      if (!isSessionContextCurrent(sessionContext)) return;
      persistTokens(data);
      sessionContext = captureSessionContext();
      clearAuthenticationInputs();
      const activated = await activateSessionSingleflight(sessionContext);
      if (!activated || !isSessionContextCurrent(sessionContext)) return;
      setStatus(nodes.authMessage, t("auth.loggedIn"));
      toast(t("auth.loginSuccess"));
    } catch (error) {
      if (sessionContext && !isSessionContextCurrent(sessionContext)) return;
      if (error instanceof ValidationError) {
        setStatus(nodes.authMessage, validationErrorMessage(error));
      } else {
        setStatus(nodes.authMessage, normalizeAuthError(error));
      }
    }
  });

  nodes.resumeOfflineButton?.addEventListener("click", () => {
    void resumeOfflineSession();
  });

  nodes.togglePasswordVisibilityButton?.addEventListener("click", togglePasswordVisibility);

  nodes.syncStatusButton.addEventListener("click", () => {
    void refreshSyncStatus({ announce: true });
  });

  nodes.settingsSupportButton?.addEventListener("click", () => {
    openSettingsSupportPanel();
  });

  nodes.settingsSupportCloseButton?.addEventListener("click", () => {
    closeSettingsSupportPanel();
  });

  nodes.settingsSupportBackdrop?.addEventListener("click", (event) => {
    if (event.target === nodes.settingsSupportBackdrop) closeSettingsSupportPanel();
  });

  nodes.logoutButton.addEventListener("click", () => {
    void logoutWithConfirmation();
  });

  nodes.refreshAllButton.addEventListener("click", () => {
    void refreshAll();
  });

  nodes.passwordChangeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void changeAccountPassword();
  });

  nodes.accountSecurityTools?.addEventListener("toggle", () => {
    if (nodes.accountSecurityTools.open && hasSession() && state.sessions.length === 0) {
      void refreshAccountSessions();
    }
  });

  nodes.refreshSessionsButton?.addEventListener("click", () => {
    void refreshAccountSessions({ announce: true });
  });

  nodes.revokeOtherSessionsButton?.addEventListener("click", () => {
    void revokeOtherAccountSessions();
  });

  nodes.sessionList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-session-id]");
    if (button) void revokeAccountSession(Number(button.dataset.sessionId));
  });

  nodes.notificationPermissionButton?.addEventListener("click", () => {
    void requestTaskNotificationPermission();
  });

  nodes.openSyncSupportButton?.addEventListener("click", () => {
    openSyncSupportPanel();
  });

  nodes.taskSyncHealthActionButton?.addEventListener("click", () => {
    openSyncSupportPanel();
  });

  nodes.exportLocalBackupButton?.addEventListener("click", () => {
    void exportLocalBackup();
  });

  nodes.importLocalBackupInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void importLocalBackupFromFile(file);
    }
  });

  nodes.undoLocalBackupImportButton?.addEventListener("click", () => {
    void undoLastLocalBackupImport();
  });

  nodes.clearLocalDataButton?.addEventListener("click", () => {
    void clearLocalDeviceData();
  });

  nodes.clientErrorReportingToggle?.addEventListener("change", () => {
    state.clientErrorReportingEnabled = Boolean(nodes.clientErrorReportingToggle.checked);
    writeStoredString("clientErrorReportingEnabled", state.clientErrorReportingEnabled ? "true" : "false");
  });

  nodes.openTaskCreateButton?.addEventListener("click", () => {
    openTaskCreatePanel({ focusTitle: true });
  });

  nodes.quickTaskTitle?.addEventListener("input", persistQuickTaskDraft);
  nodes.quickTaskTitle?.addEventListener("change", persistQuickTaskDraft);

  nodes.quickTaskForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitQuickTask();
  });

  nodes.mobileQuickCreateButton?.addEventListener("click", () => {
    openTaskCreatePanel({ focusTitle: true, scroll: true });
  });

  nodes.mobileQuickTaskListButton?.addEventListener("click", () => {
    nodes.taskListStack?.scrollIntoView({ block: "start" });
  });

  nodes.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.loading) return;
    const sessionContext = captureSessionContext();
    let submittedDraft = currentTaskDraft();
    setBusy(true);
    try {
      const payload = readTaskPayload();
      persistTaskDraft();
      submittedDraft = currentTaskDraft();
      if (state.editingTaskId !== null) {
        const editingTaskId = state.editingTaskId;
        if (state.editingTaskVersion !== null) {
          payload.expected_version = state.editingTaskVersion;
        }
        if (shouldQueueOfflineMutation()) {
          await updateTaskOffline(editingTaskId, payload);
          if (!isSessionContextCurrent(sessionContext)) return;
          toast(pendingSyncSavedMessage());
          finishTaskDraftSubmission(submittedDraft);
          render();
          return;
        }
        try {
          await updateTask(editingTaskId, payload);
          if (!isSessionContextCurrent(sessionContext)) return;
          toast(t("task.saved"));
        } catch (error) {
          if (!isSessionContextCurrent(sessionContext)) return;
          if (!isConflictError(error) && isOfflineCapableError(error)) {
            await updateTaskOffline(editingTaskId, payload);
            if (!isSessionContextCurrent(sessionContext)) return;
            toast(pendingSyncSavedMessage());
            finishTaskDraftSubmission(submittedDraft);
            render();
            return;
          }
          throw error;
        }
        finishTaskDraftSubmission(submittedDraft);
      } else {
        await createTaskWithOfflineFallback(payload);
        if (!isSessionContextCurrent(sessionContext)) return;
        finishTaskDraftSubmission(submittedDraft);
      }
      await Promise.all([refreshTasks(), refreshMeta()]);
      if (isSessionContextCurrent(sessionContext)) render();
    } catch (error) {
      if (!isSessionContextCurrent(sessionContext)) return;
      reportTaskDraftSubmissionError(submittedDraft, error);
      if (isConflictError(error)) {
        await Promise.allSettled([refreshTasks(), refreshMeta()]);
      }
    } finally {
      if (isSessionContextCurrent(sessionContext)) setBusy(false);
    }
  });

  nodes.taskChecklist.addEventListener("input", () => {
    state.checklistDraftItems = parseChecklistInput(nodes.taskChecklist.value, state.checklistDraftItems);
    renderTaskChecklistItems();
  });

  nodes.taskChecklistItems.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-checklist-action]");
    if (!button) return;
    if (button.dataset.checklistAction === "delete") {
      deleteChecklistDraftItem(button.dataset.checklistItemId);
    }
  });

  nodes.taskChecklistItems.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-checklist-action]");
    if (!checkbox) return;
    if (checkbox.dataset.checklistAction === "toggle") {
      toggleChecklistDraftItem(checkbox.dataset.checklistItemId);
    }
  });

  nodes.taskForm.addEventListener("input", () => {
    updateTaskTemplateNameVisibility();
    renderTaskQuickPreview();
    persistTaskDraft();
  });

  nodes.taskForm.addEventListener("change", () => {
    updateTaskTemplateNameVisibility();
    renderTaskQuickPreview();
    persistTaskDraft();
  });

  nodes.resetTaskFormButton.addEventListener("click", async () => {
    if (!(await confirmResetCurrentTaskForm())) {
      return;
    }
    resetCurrentTaskForm();
  });

  nodes.cancelEditButton.addEventListener("click", () => {
    closeTaskEditor();
  });

  nodes.taskCreateDetails?.addEventListener("click", (event) => {
    if (event.target === nodes.taskCreateDetails) closeTaskEditor();
  });

  document.addEventListener("pointerdown", (event) => {
    if (activeTaskMenu && !activeTaskMenu.details.contains(event.target)) {
      closeTaskActionMenu({ restoreFocus: false });
    }
  });
  document.addEventListener("focusin", (event) => {
    if (activeTaskMenu && !activeTaskMenu.details.contains(event.target)) {
      closeTaskActionMenu({ restoreFocus: false });
    }
  });
  document.addEventListener("scroll", scheduleTaskMenuPosition, true);
  window.addEventListener("resize", scheduleTaskMenuPosition);

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || handleTaskMenuKeydown(event)) return;
    const confirmOpen = nodes.confirmDialog && !nodes.confirmDialog.hidden;
    if (!confirmOpen && !nodes.settingsSupportPanel?.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettingsSupportPanel();
        return;
      }
      if (event.key === "Tab") {
        trapSettingsSupportFocus(event);
      }
      return;
    }
    if (!state.editorOpen || confirmOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeTaskEditor();
      return;
    }
    if (event.key === "Tab") {
      trapTaskEditorFocus(event);
    }
  });

  nodes.clearSearchButton.addEventListener("click", () => {
    nodes.taskSearch.value = "";
    state.search = "";
    resetOfflineTaskRenderLimit();
    persistTaskListPreferences();
    renderActiveTaskFilters();
    void refreshTasks();
  });

  nodes.clearTaskFiltersButton.addEventListener("click", () => {
    resetTaskListFilters();
  });

  nodes.enterTaskSelectionButton?.addEventListener("click", () => {
    if (state.taskSelectionMode) {
      exitTaskSelectionMode();
    } else {
      enterTaskSelectionMode();
    }
  });

  nodes.selectAllVisibleTasksButton?.addEventListener("click", () => {
    selectAllVisibleTasks();
  });

  nodes.completeSelectedTasksButton?.addEventListener("click", () => {
    void completeSelectedTasks();
  });

  nodes.deleteSelectedTasksButton?.addEventListener("click", () => {
    void deleteSelectedTasks();
  });

  nodes.cancelTaskSelectionButton?.addEventListener("click", () => {
    cancelTaskSelection();
  });

  nodes.offlineTaskLimitLoadMoreButton?.addEventListener("click", () => {
    void increaseOfflineTaskRenderLimit();
  });

  nodes.taskSearch.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.search = nodes.taskSearch.value.trim();
      resetOfflineTaskRenderLimit();
      persistTaskListPreferences();
      renderActiveTaskFilters();
      void refreshTasks();
    }, 250);
  });

  nodes.viewButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    const shouldApplyCreatePreset = isTaskDraftInputOnlyCreatePreset();
    state.view = button.dataset.view;
    resetOfflineTaskRenderLimit();
    persistTaskListPreferences();
    if (shouldApplyCreatePreset) {
      applyTaskCreatePresetForCurrentView();
    }
    renderViews();
    renderActiveTaskFilters();
    void refreshTasks();
  });

  nodes.moreViewSelect?.addEventListener("change", () => {
    const shouldApplyCreatePreset = isTaskDraftInputOnlyCreatePreset();
    state.view = nodes.moreViewSelect.value;
    resetOfflineTaskRenderLimit();
    persistTaskListPreferences();
    if (shouldApplyCreatePreset) {
      applyTaskCreatePresetForCurrentView();
    }
    renderViews();
    renderActiveTaskFilters();
    void refreshTasks();
  });

  nodes.projectFilter?.addEventListener("change", () => {
    state.projectFilter = nodes.projectFilter.value;
    persistTaskListPreferences();
    renderActiveTaskFilters();
    void refreshTasks();
  });

  nodes.tagFilter?.addEventListener("change", () => {
    state.tagFilter = nodes.tagFilter.value;
    persistTaskListPreferences();
    renderActiveTaskFilters();
    void refreshTasks();
  });

  nodes.taskList.addEventListener("change", (event) => {
    const selection = event.target.closest("input[data-task-selection-id]");
    if (!selection) return;
    setTaskSelected(selection.dataset.taskSelectionId, selection.checked);
  });

  nodes.taskList.addEventListener("click", async (event) => {
    const bulkButton = event.target.closest("button[data-trash-bulk-action]");
    if (bulkButton) {
      const bulkAction = bulkButton.dataset.trashBulkAction;
      if (bulkAction === "clear-selection") {
        clearSelectedTrashTasks();
        return;
      }
      if (bulkAction === "restore-selected") {
        await restoreSelectedTrashTasks();
        return;
      }
      if (bulkAction === "purge-selected") {
        await purgeSelectedTrashTasks();
        return;
      }
    }

    const button = event.target.closest("button[data-task-action]");
    if (!button) return;
    const id = Number(button.dataset.taskId);
    if (!Number.isFinite(id)) return;
    const action = button.dataset.taskAction;
    closeTaskActionMenu();
    if (action === "view-details") return;
    if (action === "edit") {
      const task = findTaskById(id);
      if (task) {
        beginTaskEdit(task);
      }
      return;
    }
    try {
      const task = findTaskById(id);
      if (!task) {
        toast(t("task.refreshedRetry"));
        return;
      }
      if (action === "use-cloud-conflict") {
        await useCloudConflictTask(task);
        return;
      }
      if (action === "overwrite-cloud-conflict") {
        await overwriteCloudConflictTask(task);
        return;
      }
      if (action === "instantiate-template") {
        await instantiateTemplateTask(task);
        return;
      }
      if (["plan-today", "plan-tomorrow", "snooze-later"].includes(action)) {
        await applyTaskScheduleAction(task, action);
        return;
      }
      if (action === "retry-sync") {
        await retryFailedTaskSync(task);
        return;
      }
      if (action === "discard-sync") {
        await discardFailedTaskSync(task);
        return;
      }
      if (action === "purge") {
        await purgeTask(task);
        return;
      }
      await applyTaskAction(task, action);
    } catch (error) {
      if (isConflictError(error)) {
        toast(t("task.updatedElsewhere"));
        await Promise.allSettled([refreshTasks(), refreshMeta()]);
        return;
      }
      toast(normalizeError(error));
    }
  });

  nodes.taskList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-trash-selection-id]");
    if (!checkbox) return;
    setTrashTaskSelected(checkbox.dataset.trashSelectionId, checkbox.checked);
  });

  nodes.installAppButton.addEventListener("click", installApp);
  nodes.installHelpCloseButton.addEventListener("click", () => {
    nodes.installHelpPanel.hidden = true;
  });
  nodes.password.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      nodes.authForm.requestSubmit();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
    renderInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    installPromptEvent = null;
    renderInstallButton();
    toast(t("install.installed"));
  });
  window.addEventListener("online", () => {
    updateConnectionBadge();
    if (state.offlineMode) {
      setStatus(nodes.taskMessage, t("auth.offlineModeActive"));
      toast(t("sync.nextStepSignIn"));
      return;
    }
    if (!hasSession()) {
      return;
    }
    void flushOfflineQueue()
      .then(() => refreshAll())
      .catch((error) => {
        setStatus(nodes.taskMessage, normalizeError(error));
      });
  });
  window.addEventListener("offline", updateConnectionBadge);
  window.addEventListener("beforeunload", () => {
    persistTaskDraft();
  });
}

function registerLifecycleEvents() {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && hasSession()) {
      void refreshSyncStatus();
      scheduleTaskNotifications();
    }
  });
  window.addEventListener("error", (event) => {
    void reportClientError(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    void reportClientError(event.reason);
  });
}

function setLanguage(language) {
  state.language = normalizeLanguage(language);
  document.documentElement.lang = state.language;
  nodes.languageSelect.value = state.language;
  writeStoredString("language", state.language);
  translateShell();
  renderInstallButton();
  renderTaskChecklistItems();
  updateAuthMode();
  renderAccountSecurity();
  renderNotificationSettings();
  renderViews();
  renderMeta();
  renderLocalDataTools();
  renderSyncStatus();
  renderTaskSyncHealthBar();
  renderTasks();
  renderSummary();
  renderOfflineTaskLimitNotice();
  renderTaskQuickPreview();
  renderTaskEditorState();
  renderOfflineResumePanel();
  renderSessionActions();
}

function normalizeLanguage(language) {
  return language === "en-US" ? "en-US" : "zh-CN";
}

function getInitialLanguage() {
  const savedLanguage = readStoredString("language", "");
  if (savedLanguage) return normalizeLanguage(savedLanguage);
  return normalizeLanguage(navigator.language || document.documentElement.lang || "zh-CN");
}

function t(key) {
  return I18N[state.language]?.[key] || I18N["zh-CN"][key] || key;
}

function formatMessage(key, values = {}) {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value ?? "")),
    t(key),
  );
}

function translateShell() {
  document.documentElement.lang = state.language;
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  }
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
  nodes.languageSelect?.setAttribute("aria-label", t("language.label"));
  if (nodes.installHelpText && nodes.installHelpPanel && !nodes.installHelpPanel.hidden) {
    nodes.installHelpText.textContent = getInstallHelpMessage();
  }
}

function hydrateInputs() {
  nodes.languageSelect.value = state.language;
  translateShell();
  nodes.taskSearch.value = state.search;
  if (nodes.projectFilter) nodes.projectFilter.value = state.projectFilter;
  if (nodes.tagFilter) nodes.tagFilter.value = state.tagFilter;
  if (nodes.clientErrorReportingToggle) {
    nodes.clientErrorReportingToggle.checked = state.clientErrorReportingEnabled;
  }
  nodes.taskPriority.value = "0";
  nodes.taskListType.value = "inbox";
  nodes.taskRepeatRule.value = "";
  applyTaskCreatePresetForCurrentView();
  renderViews();
  renderTaskEditorState();
  renderTaskChecklistItems();
}

async function selectAuthMode(mode) {
  const nextMode = mode === "register" ? "register" : "login";
  if (nextMode === "register" && !(await ensureRegistrationModeAvailable())) {
    return;
  }
  state.authMode = nextMode;
  state.passwordVisible = false;
  updateAuthMode();
}

async function ensureRegistrationModeAvailable() {
  if (isRegistrationModeAvailable()) {
    return true;
  }
  if (!state.registrationStatusKnown) {
    await loadRegistrationStatus();
    if (isRegistrationModeAvailable()) {
      return true;
    }
  }
  setStatus(
    nodes.authMessage,
    state.registrationStatusKnown && !state.registrationEnabled
      ? registrationDisabledHelp()
      : t("auth.registrationCheckFailed"),
  );
  return false;
}

function updateAuthMode() {
  const registerAvailable = isRegistrationModeAvailable();
  const registrationBlocked = state.registrationStatusKnown && !state.registrationEnabled;
  if (!registerAvailable && state.authMode === "register") {
    state.authMode = "login";
  }
  nodes.authScreen.dataset.mode = state.authMode;
  for (const button of nodes.authModeSwitch.querySelectorAll("button")) {
    if (button.dataset.mode === "register") {
      button.disabled = registrationBlocked;
      button.title = registerAvailable ? "" : registrationBlocked ? registrationDisabledHelp() : registrationStatusPendingHelp();
      button.setAttribute("aria-disabled", String(registrationBlocked));
    }
    button.classList.toggle("active", button.dataset.mode === state.authMode);
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.authMode));
  }
  for (const element of nodes.authScreen.querySelectorAll(".auth-register-only")) {
    element.hidden = state.authMode !== "register";
  }
  for (const element of nodes.authScreen.querySelectorAll(".auth-login-only")) {
    element.hidden = state.authMode !== "login";
  }
  nodes.usernameOrEmail.required = state.authMode === "login";
  nodes.username.required = state.authMode === "register";
  nodes.email.required = state.authMode === "register";
  nodes.password.required = true;
  nodes.password.autocomplete = state.authMode === "login" ? "current-password" : "new-password";
  nodes.password.minLength = state.authMode === "register" ? 8 : 1;
  nodes.authSubmitButton.textContent = state.authMode === "login" ? t("auth.login") : t("auth.register");
  renderPasswordVisibility();
  const pendingHelp = registrationStatusPendingHelp();
  const gateMessage = registerAvailable
    ? t("auth.registrationEnabled")
    : state.registrationStatusKnown && !state.registrationEnabled
      ? registrationDisabledHelp()
      : pendingHelp;
  if (nodes.registrationGateHint) {
    nodes.registrationGateHint.textContent = gateMessage;
    nodes.registrationGateHint.hidden = state.authMode !== "register" || !gateMessage;
  }
  renderOfflineResumePanel();
}

function togglePasswordVisibility() {
  state.passwordVisible = !state.passwordVisible;
  renderPasswordVisibility();
}

function renderPasswordVisibility() {
  if (!nodes.password || !nodes.togglePasswordVisibilityButton) return;
  nodes.password.type = state.passwordVisible ? "text" : "password";
  const label = state.passwordVisible ? t("auth.hidePassword") : t("auth.showPassword");
  nodes.togglePasswordVisibilityButton.textContent = label;
  nodes.togglePasswordVisibilityButton.setAttribute("aria-label", label);
  nodes.togglePasswordVisibilityButton.setAttribute("aria-pressed", String(state.passwordVisible));
}

async function loadRegistrationStatus() {
  const requestSequence = registrationRequestGate.begin();
  try {
    const status = await apiRequest("/auth/registration", { auth: false });
    if (!registrationRequestGate.isCurrent(requestSequence)) return false;
    state.registrationEnabled = Boolean(status?.registration_enabled ?? true);
    state.registrationStatusKnown = true;
    updateAuthMode();
    return true;
  } catch {
    if (!registrationRequestGate.isCurrent(requestSequence)) return false;
    state.registrationEnabled = false;
    state.registrationStatusKnown = false;
    updateAuthMode();
    return false;
  }
}

function render() {
  const workspaceActive = hasLocalWorkspace();
  nodes.authScreen.hidden = workspaceActive;
  nodes.appScreen.hidden = !workspaceActive;
  nodes.apiDisplay.textContent = state.apiBaseUrl;
  nodes.deviceDisplay.textContent = state.deviceId;
  nodes.userDisplay.textContent = state.user ? displayUser(state.user) : "-";
  renderSessionActions();
  renderOfflineResumePanel();
  renderInstallButton();
  updateConnectionBadge();
  renderMeta();
  renderViews();
  renderLocalDataTools();
  renderSyncStatus();
  renderTasks();
  renderSummary();
  renderOfflineTaskLimitNotice();
  renderActiveTaskFilters();
  renderTaskEditorState();
  renderAccountSecurity();
  renderNotificationSettings();
}

function hasLocalWorkspace() {
  return Boolean(state.user) && (hasSession() || state.offlineMode);
}

function renderSessionActions() {
  const workspaceActive = hasLocalWorkspace();
  nodes.logoutButton.hidden = !workspaceActive;
  nodes.logoutButton.textContent = state.offlineMode ? t("auth.signInToSync") : t("auth.logout");
  nodes.logoutButton.dataset.i18n = state.offlineMode ? "auth.signInToSync" : "auth.logout";
  nodes.syncStatusButton.hidden = !hasSession();
}

function renderAccountSecurity() {
  if (!nodes.accountSecurityTools) return;
  const available = hasSession() && !state.offlineMode;
  nodes.accountSecurityTools.hidden = !available;
  for (const control of nodes.passwordChangeForm?.elements || []) {
    control.disabled = !available || state.loading;
  }
  if (nodes.refreshSessionsButton) {
    nodes.refreshSessionsButton.disabled = !available || state.loading;
  }
  if (nodes.revokeOtherSessionsButton) {
    nodes.revokeOtherSessionsButton.disabled = !available || state.loading;
  }
  renderAccountSessions();
}

function renderAccountSessions() {
  if (!nodes.sessionList) return;
  nodes.sessionList.replaceChildren();
  if (!hasSession()) return;
  if (state.sessions.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = t("account.noSessions");
    nodes.sessionList.appendChild(empty);
    return;
  }

  const tokenSessionId = readCurrentRefreshSessionId();
  const fallbackCurrentSessionId = tokenSessionId === null
    ? Number(state.sessions.find((session) => session.device_id === state.deviceId)?.id)
    : null;
  for (const session of state.sessions) {
    const sessionId = Number(session.id);
    const isCurrent = sessionId === tokenSessionId || sessionId === fallbackCurrentSessionId;
    const item = document.createElement("li");

    const title = document.createElement("strong");
    title.textContent = session.device_id || t("account.unknownDevice");
    if (isCurrent) {
      const current = document.createElement("span");
      current.className = "badge badge-success session-current-badge";
      current.textContent = t("account.currentSession");
      title.append(" ", current);
    }

    const created = document.createElement("small");
    created.textContent = formatMessage("account.sessionCreated", {
      time: formatDisplayDateTime(session.created_at),
    });
    const expires = document.createElement("small");
    expires.textContent = formatMessage("account.sessionExpires", {
      time: formatDisplayDateTime(session.expires_at),
    });
    item.append(title, created, expires);

    if (!isCurrent && Number.isFinite(sessionId)) {
      const revokeButton = document.createElement("button");
      revokeButton.type = "button";
      revokeButton.className = "text-button danger-text-button";
      revokeButton.dataset.sessionId = String(sessionId);
      revokeButton.textContent = t("account.revokeSession");
      revokeButton.disabled = state.loading;
      item.appendChild(revokeButton);
    }
    nodes.sessionList.appendChild(item);
  }
}

function readCurrentRefreshSessionId() {
  try {
    const encodedPayload = String(state.accessToken || "").split(".")[1];
    if (!encodedPayload) return null;
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    const sessionId = Number(payload.session_id);
    return Number.isFinite(sessionId) ? sessionId : null;
  } catch {
    return null;
  }
}

async function changeAccountPassword() {
  setBusy(true);
  try {
    const payload = buildPasswordChangePayload(
      nodes.currentPassword.value,
      nodes.newPassword.value,
      nodes.confirmNewPassword.value,
    );
    const result = await apiRequest("/auth/password", {
      method: "PUT",
      body: payload,
      retryAuth: false,
    });
    clearAccountScopedInputs([
      nodes.currentPassword,
      nodes.newPassword,
      nodes.confirmNewPassword,
    ]);
    const message = formatMessage("account.passwordChanged", { count: Number(result?.revoked || 0) });
    setStatus(nodes.accountSecurityMessage, message);
    toast(message);
    await refreshAccountSessions();
  } catch (error) {
    const message = formatMessage("account.passwordChangeFailed", {
      message: accountPasswordErrorMessage(error),
    });
    setStatus(nodes.accountSecurityMessage, message);
  } finally {
    setBusy(false);
  }
}

function accountPasswordErrorMessage(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("confirmation")) return t("account.passwordMismatch");
  if (message.includes("at least 8")) return t("account.passwordTooShort");
  if (error instanceof ApiError && error.status === 401) return t("account.currentPasswordInvalid");
  return normalizeError(error);
}

async function refreshAccountSessions({ announce = false } = {}) {
  if (!hasSession()) {
    state.sessions = [];
    renderAccountSecurity();
    return;
  }
  try {
    const sessions = await apiRequest("/auth/sessions");
    state.sessions = Array.isArray(sessions) ? sessions : [];
    renderAccountSecurity();
    if (announce) {
      setStatus(nodes.accountSecurityMessage, t("account.sessionsUpdated"));
    }
  } catch (error) {
    const message = formatMessage("account.sessionsLoadFailed", { message: normalizeError(error) });
    setStatus(nodes.accountSecurityMessage, message);
  }
}

async function revokeOtherAccountSessions() {
  const confirmed = await confirmUserAction({
    title: t("account.revokeOtherSessionsTitle"),
    message: t("account.revokeOtherSessionsMessage"),
    confirmText: t("account.revokeOtherSessionsConfirm"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  try {
    const result = await apiRequest("/auth/sessions/revoke-other-devices", {
      method: "POST",
      body: { device_id: state.deviceId },
    });
    const message = formatMessage("account.otherSessionsRevoked", { count: Number(result?.revoked || 0) });
    setStatus(nodes.accountSecurityMessage, message);
    toast(message);
    await refreshAccountSessions();
  } catch (error) {
    setStatus(nodes.accountSecurityMessage, normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function revokeAccountSession(sessionId) {
  const session = state.sessions.find((candidate) => Number(candidate.id) === Number(sessionId));
  if (!session) return;
  const device = session.device_id || t("account.unknownDevice");
  const confirmed = await confirmUserAction({
    title: t("account.revokeSessionTitle"),
    message: formatMessage("account.revokeSessionMessage", { device }),
    confirmText: t("account.revokeSessionConfirm"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  try {
    await apiRequest(`/auth/sessions/${encodeURIComponent(String(sessionId))}`, { method: "DELETE" });
    setStatus(nodes.accountSecurityMessage, t("account.sessionRevoked"));
    toast(t("account.sessionRevoked"));
    await refreshAccountSessions();
  } catch (error) {
    setStatus(nodes.accountSecurityMessage, normalizeError(error));
  } finally {
    setBusy(false);
  }
}

function renderNotificationSettings() {
  if (!nodes.notificationPermissionButton || !nodes.notificationStatus) return;
  const capability = taskNotificationCapability();
  if (capability !== "supported") {
    nodes.notificationPermissionButton.hidden = false;
    nodes.notificationPermissionButton.disabled = true;
    nodes.notificationStatus.textContent = t(
      capability === "insecure" ? "notification.insecureContext" : "notification.unsupported",
    );
    return;
  }

  const permission = Notification.permission;
  nodes.notificationPermissionButton.hidden = permission === "granted";
  nodes.notificationPermissionButton.disabled = state.loading || permission === "denied";
  if (permission === "denied") {
    nodes.notificationStatus.textContent = t("notification.denied");
  } else if (permission === "granted" && state.notificationScheduledCount > 0) {
    nodes.notificationStatus.textContent = formatMessage("notification.upcomingScheduled", {
      count: state.notificationScheduledCount,
    });
  } else if (permission === "granted") {
    nodes.notificationStatus.textContent = t("notification.noUpcoming");
  } else {
    nodes.notificationStatus.textContent = t("notification.closedAppLimit");
  }
}

function taskNotificationCapability() {
  if (!("Notification" in window)) return "unsupported";
  const secureContext = window.isSecureContext === true ||
    location.protocol === "https:" ||
    isLoopbackHost(location.hostname);
  return secureContext ? "supported" : "insecure";
}

async function requestTaskNotificationPermission() {
  if (taskNotificationCapability() !== "supported") {
    renderNotificationSettings();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await scheduleTaskNotifications();
    } else {
      clearTaskNotificationTimers();
      renderNotificationSettings();
    }
  } catch {
    clearTaskNotificationTimers();
    setStatus(nodes.notificationStatus, t("notification.failed"));
  }
}

async function scheduleTaskNotifications() {
  const scheduleSequence = ++notificationScheduleSequence;
  cancelTaskNotificationTimers();
  state.notificationScheduledCount = 0;
  if (
    taskNotificationCapability() !== "supported" ||
    Notification.permission !== "granted" ||
    !hasLocalWorkspace()
  ) {
    renderNotificationSettings();
    return;
  }

  let tasks = state.tasks;
  if (supportsIndexedDb() && getCurrentUserId()) {
    try {
      tasks = await listCachedTasks();
    } catch {
      tasks = state.tasks;
    }
  }
  if (scheduleSequence !== notificationScheduleSequence) return;

  const now = Date.now();
  for (const task of tasks) {
    const reminderAt = getTaskReminderAt(task);
    const reminderTime = reminderAt ? new Date(reminderAt).getTime() : Number.NaN;
    if (!Number.isFinite(reminderTime) || reminderTime <= now) continue;
    scheduleTaskNotificationTimer(task, reminderTime, scheduleSequence);
    state.notificationScheduledCount += 1;
  }
  renderNotificationSettings();
}

function scheduleTaskNotificationTimer(task, reminderTime, scheduleSequence) {
  const taskKey = String(task.id);
  const maxDelay = 2_147_000_000;
  const delay = Math.min(Math.max(0, reminderTime - Date.now()), maxDelay);
  const timer = window.setTimeout(async () => {
    notificationTimers.delete(taskKey);
    if (scheduleSequence !== notificationScheduleSequence) return;
    if (reminderTime - Date.now() > 1000) {
      scheduleTaskNotificationTimer(task, reminderTime, scheduleSequence);
      return;
    }
    try {
      await showTaskNotification(task, reminderTime);
    } catch {
      setStatus(nodes.notificationStatus, t("notification.failed"));
    }
  }, delay);
  notificationTimers.set(taskKey, timer);
}

async function showTaskNotification(task, reminderTime) {
  const url = buildTaskNotificationUrl(task.id, location.href);
  const options = {
    body: formatMessage("notification.taskBody", { title: task.title || t("task.untitled") }),
    tag: `taskbridge-task-${task.id}-${reminderTime}`,
    data: { url },
    icon: "./icon-192.png",
    badge: "./icon-192.png",
  };
  if (supportsServiceWorker()) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("TaskBridge", options);
    return;
  }
  const notification = new Notification("TaskBridge", options);
  notification.onclick = () => {
    window.focus();
    location.assign(url);
  };
}

function clearTaskNotificationTimers() {
  notificationScheduleSequence += 1;
  cancelTaskNotificationTimers();
  state.notificationScheduledCount = 0;
}

function cancelTaskNotificationTimers() {
  for (const timer of notificationTimers.values()) {
    window.clearTimeout(timer);
  }
  notificationTimers.clear();
}

function readNotificationTaskId() {
  const taskId = Number(new URLSearchParams(location.search).get("task"));
  return Number.isFinite(taskId) && taskId !== 0 ? taskId : null;
}

function focusLinkedTask() {
  if (state.notificationTaskId === null || !nodes.taskList) return;
  const linkedTask = [...nodes.taskList.querySelectorAll("[data-task-id]")]
    .find((item) => Number(item.dataset.taskId) === Number(state.notificationTaskId));
  if (!linkedTask) return;
  const taskId = state.notificationTaskId;
  state.notificationTaskId = null;
  const focusTask = () => {
    linkedTask.tabIndex = -1;
    linkedTask.scrollIntoView({ block: "center" });
    linkedTask.focus({ preventScroll: true });
    linkedTask.classList.add("is-notification-target");
    window.setTimeout(() => linkedTask.classList.remove("is-notification-target"), 1600);
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(focusTask);
  } else {
    focusTask();
  }
  return taskId;
}

function renderOfflineResumePanel() {
  if (!nodes.offlineResumePanel || !nodes.resumeOfflineButton) return;
  const canResume =
    !hasSession() &&
    !state.offlineMode &&
    state.authMode === "login" &&
    Boolean(state.offlineProfile) &&
    state.offlineCacheReady &&
    isOfflineProfileForApi(state.offlineProfile, state.apiBaseUrl) &&
    supportsIndexedDb();
  nodes.offlineResumePanel.hidden = !canResume;
  nodes.resumeOfflineButton.disabled = state.loading || !canResume;
  if (nodes.offlineResumeHint) {
    nodes.offlineResumeHint.textContent = t("auth.resumeOfflineHint");
  }
}

function renderLocalDataTools() {
  if (!nodes.undoLocalBackupImportButton) return;
  if (hasLocalWorkspace() && lastImportedBackupTaskIds.length === 0) {
    loadLastImportedBackupTaskIds();
  }
  const canUndo = lastImportedBackupTaskIds.length > 0 && hasLocalWorkspace();
  nodes.undoLocalBackupImportButton.hidden = !canUndo;
  nodes.undoLocalBackupImportButton.disabled = state.loading || !canUndo;
  if (nodes.clearLocalDataButton) {
    const blocked = hasLocalDataClearRisk();
    nodes.clearLocalDataButton.disabled = state.loading || blocked;
    nodes.clearLocalDataButton.title = blocked ? t("app.clearLocalDataBlocked") : "";
    if (nodes.clearLocalDataBlockedHint) {
      nodes.clearLocalDataBlockedHint.hidden = !blocked;
    }
  }
}

function renderInstallButton() {
  const workspaceActive = hasLocalWorkspace();
  nodes.installAppButton.hidden = !workspaceActive;
  if (!workspaceActive) {
    return;
  }
  const installActionLabel = installPromptEvent ? t("install.installApp") : t("install.action");
  nodes.installAppButton.textContent = installActionLabel;
}

async function installApp() {
  if (!installPromptEvent) {
    showInstallHelp();
    return;
  }
  const promptEvent = installPromptEvent;
  installPromptEvent = null;
  renderInstallButton();
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice.catch(() => null);
  if (choice?.outcome !== "accepted") {
    showInstallHelp();
  }
}

function showInstallHelp() {
  nodes.installHelpText.textContent = getInstallHelpMessage();
  nodes.installHelpPanel.hidden = false;
}

function getInstallHelpMessage() {
  if (window.isSecureContext !== true) {
    return t("install.insecureContext");
  }
  const userAgent = navigator.userAgent.toLowerCase();
  if (window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone) {
    return t("install.alreadyInstalled");
  }
  if (/iphone|ipad|ipod/.test(userAgent) && /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent)) {
    return t("install.iosSafari");
  }
  if (/android/.test(userAgent) && /chrome|crios/.test(userAgent)) {
    return t("install.androidChrome");
  }
  if (/edg\//.test(userAgent)) {
    return t("install.edge");
  }
  if (/chrome|chromium|crios/.test(userAgent)) {
    return t("install.chrome");
  }
  return t("install.generic");
}

async function logoutWithConfirmation() {
  if (state.offlineMode) {
    leaveOfflineModeForSignIn();
    return;
  }
  if (
    hasUnsyncedWebWork() &&
    !(await confirmUserAction({
      title: t("auth.logoutTitle"),
      message: logoutPendingWarning(),
      confirmText: t("auth.logoutConfirm"),
    }))
  ) {
    return;
  }
  persistTaskDraft();
  const revocationConfirmed = await attemptSessionRevocation(
    () => apiRequest("/auth/session", { method: "DELETE" }),
  );
  suppressPersistentSession();
  broadcastSessionSignedOut();
  forgetOfflineProfile();
  clearSession();
  render();
  const message = revocationConfirmed
    ? t("auth.loggedOut")
    : t("auth.loggedOutRevocationUnconfirmed");
  setStatus(nodes.authMessage, message);
  toast(message);
}

async function resumeOfflineSession() {
  const profile = normalizeOfflineProfile(state.offlineProfile || readOfflineProfile());
  if (
    !profile ||
    !supportsIndexedDb() ||
    !isOfflineProfileForApi(profile, state.apiBaseUrl) ||
    !(await isOfflineCacheReadyForProfile(profile))
  ) {
    state.offlineCacheReady = false;
    setStatus(nodes.authMessage, t("auth.offlineProfileUnavailable"));
    renderOfflineResumePanel();
    return;
  }

  state.offlineMode = true;
  state.user = profile;
  state.syncStatus = null;
  setBusy(true);
  try {
    await hydrateCachedTasks();
    if (!restoreTaskDraft()) {
      applyTaskCreatePresetForCurrentView();
    }
    setStatus(nodes.taskMessage, t("auth.offlineModeActive"));
    render();
  } catch (error) {
    closeOfflineDb();
    state.offlineMode = false;
    state.user = null;
    state.tasks = [];
    state.meta = null;
    const message = localOperationErrorMessage(error);
    setStatus(nodes.authMessage, message);
    render();
  } finally {
    setBusy(false);
  }
}

function leaveOfflineModeForSignIn() {
  persistTaskDraft();
  clearSession();
  render();
  setStatus(nodes.authMessage, t("sync.nextStepSignIn"));
  nodes.usernameOrEmail?.focus();
}

async function exportLocalBackup() {
  setBusy(true);
  try {
    assertLocalDataAvailable();
    const tasks = await listCachedTasks();
    if (!tasks.length) {
      setLocalDataStatus(t("app.localBackupNoTasks"));
      toast(t("app.localBackupNoTasks"));
      return;
    }
    const payload = {
      format: WEB_BACKUP_FORMAT,
      source: "web",
      exported_at: new Date().toISOString(),
      exported_count: tasks.length,
      task_count: tasks.length,
      tasks: tasks.map(serializeTaskForLocalBackup),
    };
    downloadJsonFile(`taskbridge-web-backup-${toDateInputValue(new Date())}.json`, payload);
    const message = formatMessage("app.localBackupExported", { count: tasks.length });
    setLocalDataStatus(message);
    toast(message);
  } catch (error) {
    const message = localOperationErrorMessage(error);
    setLocalDataStatus(message);
    toast(message);
  } finally {
    setBusy(false);
  }
}

async function importLocalBackupFromFile(file) {
  setBusy(true);
  try {
    assertLocalDataAvailable();
    if (file.size > WEB_BACKUP_MAX_IMPORT_BYTES) {
      throw new ValidationError("app.localBackupTooLarge");
    }
    const preview = parseLocalBackupImport(await file.text());
    if (!preview.tasks.length) {
      setLocalDataStatus(t("app.localBackupImportNothing"));
      toast(t("app.localBackupImportNothing"));
      return;
    }
    const confirmed = await confirmUserAction({
      title: t("app.localBackupImportTitle"),
      message: formatMessage("app.localBackupImportMessage", {
        count: preview.tasks.length,
        skipped: preview.skippedCount,
      }),
      confirmText: t("app.localBackupImportConfirm"),
    });
    if (!confirmed) return;
    const importResult = await importBackupTasks(preview.tasks);
    lastImportedBackupTaskIds = importResult.undoableLocalIds;
    if (lastImportedBackupTaskIds.length > 0) {
      saveLastImportedBackupTaskIds(lastImportedBackupTaskIds);
    } else {
      clearLastImportedBackupTaskIds();
    }
    renderLocalDataTools();
    let message = formatMessage("app.localBackupImported", { count: importResult.imported });
    if (importResult.undoUnavailable) {
      message = `${message} ${t("app.localBackupImportUndoUnavailable")}`;
    }
    setLocalDataStatus(message);
    toast(message);
  } catch (error) {
    const message = localOperationErrorMessage(error);
    setLocalDataStatus(message);
    toast(message);
  } finally {
    setBusy(false);
  }
}

async function undoLastLocalBackupImport() {
  try {
    assertLocalDataAvailable();
  } catch (error) {
    const message = localOperationErrorMessage(error);
    setLocalDataStatus(message);
    toast(message);
    return;
  }
  if (lastImportedBackupTaskIds.length === 0) {
    setLocalDataStatus(t("app.localBackupUndoNothing"));
    toast(t("app.localBackupUndoNothing"));
    renderLocalDataTools();
    return;
  }

  const confirmed = await confirmUserAction({
    title: t("app.localBackupUndoTitle"),
    message: formatMessage("app.localBackupUndoMessage", { count: lastImportedBackupTaskIds.length }),
    confirmText: t("app.localBackupUndoConfirm"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  try {
    const deletedCount = await deleteImportedLocalBackupTasks(lastImportedBackupTaskIds);
    lastImportedBackupTaskIds = [];
    clearLastImportedBackupTaskIds();
    renderLocalDataTools();
    const message = deletedCount > 0
      ? formatMessage("app.localBackupUndone", { count: deletedCount })
      : t("app.localBackupUndoNothing");
    setLocalDataStatus(message);
    toast(message);
  } catch (error) {
    const message = localOperationErrorMessage(error);
    setLocalDataStatus(message);
    toast(message);
  } finally {
    setBusy(false);
  }
}

async function clearLocalDeviceData() {
  try {
    assertLocalDataAvailable();
  } catch (error) {
    const message = localOperationErrorMessage(error);
    setLocalDataStatus(message);
    toast(message);
    return;
  }

  if (hasLocalDataClearRisk()) {
    const message = t("app.clearLocalDataBlocked");
    setLocalDataStatus(message);
    openSyncSupportPanel();
    toast(message);
    return;
  }

  const dbName = offlineDbName();
  const confirmed = await confirmUserAction({
    title: t("app.clearLocalDataTitle"),
    message: t("app.clearLocalDataMessage"),
    confirmText: t("app.clearLocalDataConfirm"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  localDataClearInProgress = true;
  try {
    const signedOutUser = state.user;
    const previousDeviceId = state.deviceId;
    const onlineSession = hasSession() && !state.offlineMode;
    await closeOfflineDb();
    await deleteDatabase(dbName);
    const revocationConfirmed = onlineSession
      ? await attemptSessionRevocation(() => apiRequest("/auth/session", { method: "DELETE" }))
      : true;
    removeStoredString("deviceId");
    state.deviceId = `web-${crypto.randomUUID()}`;
    writeStoredString("deviceId", state.deviceId);
    suppressPersistentSession();
    broadcastSessionSignedOut({
      user: signedOutUser,
      deviceId: previousDeviceId,
      nextDeviceId: state.deviceId,
    });
    lastImportedBackupTaskIds = [];
    clearLastImportedBackupTaskIds();
    clearTaskDraft();
    forgetOfflineProfile();
    clearSession({ discardTaskDraft: true });
    render();
    const message = revocationConfirmed
      ? t("app.localDataCleared")
      : t("app.localDataClearedRevocationUnconfirmed");
    setLocalDataStatus(message);
    toast(message);
  } catch (error) {
    const message = localOperationErrorMessage(error);
    setLocalDataStatus(message);
    toast(message);
  } finally {
    localDataClearInProgress = false;
    setBusy(false);
  }
}

function hasLocalDataClearRisk() {
  const counts = state.meta?.counts || {};
  const localPending = state.tasks.filter((task) =>
    task.offline_status === "pending_create" ||
    task.offline_status === "pending_update" ||
    task.offline_status === "pending_delete"
  ).length;
  const failed = state.tasks.filter((task) => task.offline_status === "sync_failed").length;
  const conflicts = state.tasks.filter((task) => task.offline_status === "conflict").length;
  return (
    (state.offlineQueueCount || 0) > 0 ||
    localPending > 0 ||
    failed > 0 ||
    conflicts > 0 ||
    (counts.pending || 0) > 0 ||
    (counts.conflict || 0) > 0
  );
}

function assertLocalDataAvailable() {
  if (!hasSession() && !state.offlineMode) {
    throw new ValidationError("app.localDataRequiresLogin");
  }
  if (!supportsIndexedDb()) {
    throw new ValidationError("app.localDataRequiresIndexedDb");
  }
}

function serializeTaskForLocalBackup(task) {
  return {
    title: task.title,
    content: task.content ?? null,
    status: task.status ?? "open",
    priority: normalizeBackupPriority(task.priority),
    tag: task.tag ?? null,
    project: task.project ?? null,
    list_type: task.list_type || "inbox",
    due_time: task.due_time ?? null,
    remind_time: task.remind_time ?? null,
    repeat_rule: task.repeat_rule ?? null,
    planned_date: task.planned_date ?? null,
    completed_at: task.completed_at ?? null,
    snoozed_until: task.snoozed_until ?? null,
    checklist: normalizeBackupChecklist(task.checklist),
    is_template: Boolean(task.is_template),
    template_name: task.template_name ?? null,
    sort_order: normalizeBackupSortOrder(task.sort_order),
    created_at: task.created_at ?? null,
    updated_at: task.updated_at ?? null,
    is_deleted: Boolean(task.is_deleted),
  };
}

function parseLocalBackupImport(content) {
  if (content.length > WEB_BACKUP_MAX_IMPORT_BYTES) {
    throw new ValidationError("app.localBackupTooLarge");
  }
  let raw;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new ValidationError("app.localBackupInvalid");
  }
  if (!raw || typeof raw !== "object" || !ACCEPTED_WEB_BACKUP_FORMATS.has(String(raw.format || ""))) {
    throw new ValidationError("app.localBackupUnsupported");
  }
  if (!Array.isArray(raw.tasks)) {
    throw new ValidationError("app.localBackupInvalid");
  }
  const tasks = [];
  let skippedCount = 0;
  for (const item of raw.tasks) {
    if (tasks.length >= WEB_BACKUP_MAX_IMPORT_TASKS) {
      skippedCount += 1;
      continue;
    }
    const task = normalizeBackupTaskForImport(item);
    if (task) {
      tasks.push(task);
    } else {
      skippedCount += 1;
    }
  }
  return {
    tasks,
    scannedCount: raw.tasks.length,
    skippedCount,
  };
}

function normalizeBackupTaskForImport(item) {
  if (!item || typeof item !== "object") return null;
  const title = normalizeBackupText(item.title, 255);
  if (!title) return null;
  return {
    id: null,
    title,
    content: normalizeBackupText(item.content, 10000),
    status: normalizeBackupStatus(item.status),
    priority: normalizeBackupPriority(item.priority),
    tag: normalizeBackupText(item.tag, 64),
    project: normalizeBackupText(item.project, 128),
    list_type: normalizeBackupListType(pickBackupField(item, "list_type", "listType")),
    due_time: normalizeBackupDateTime(pickBackupField(item, "due_time", "dueTime")),
    remind_time: normalizeBackupDateTime(pickBackupField(item, "remind_time", "remindTime")),
    repeat_rule: normalizeBackupText(pickBackupField(item, "repeat_rule", "repeatRule"), 255),
    planned_date: normalizeBackupDate(pickBackupField(item, "planned_date", "plannedDate")),
    completed_at: normalizeBackupDateTime(pickBackupField(item, "completed_at", "completedAt")),
    snoozed_until: normalizeBackupDateTime(pickBackupField(item, "snoozed_until", "snoozedUntil")),
    parent_task_id: null,
    checklist: normalizeBackupChecklist(item.checklist ?? item.checklist_json ?? item.checklistJson),
    is_template: Boolean(pickBackupField(item, "is_template", "isTemplate")),
    template_name: normalizeBackupText(pickBackupField(item, "template_name", "templateName"), 128),
    sort_order: normalizeBackupSortOrder(pickBackupField(item, "sort_order", "sortOrder")),
    is_deleted: Boolean(pickBackupField(item, "is_deleted", "isDeleted")),
  };
}

async function importBackupTasks(tasks) {
  return importBackupTasksOffline(tasks);
}

async function importBackupTasksOffline(tasks) {
  let imported = 0;
  const importedLocalIds = [];
  for (const task of tasks) {
    if (task.is_deleted) {
      const cachedTask = await cacheImportedDeletedBackupTaskOffline(task);
      importedLocalIds.push(cachedTask.id);
      imported += 1;
      continue;
    }
    const createdTask = await createTaskOffline(task);
    if (task.status === "completed") {
      await updateTaskOffline(createdTask.id, {
        status: "completed",
        completed_at: task.completed_at ?? null,
      });
    }
    importedLocalIds.push(createdTask.id);
    imported += 1;
  }
  const undoableLocalIds = [];
  for (const localId of importedLocalIds) {
    const cachedTask = await getCachedTask(localId);
    if (cachedTask && isLocalOnlyTask(cachedTask)) {
      undoableLocalIds.push(localId);
    }
  }
  await hydrateCachedTasks();
  return {
    imported,
    undoableLocalIds,
    undoUnavailable: false,
  };
}

async function cacheImportedDeletedBackupTaskOffline(payload) {
  const task = {
    ...makeOfflineTask(payload),
    offline_status: null,
    offline_queue_id: null,
    offline_error: null,
  };
  await putCachedTask(task);
  await hydrateCachedTasks();
  return task;
}

async function deleteImportedLocalBackupTasks(localIds) {
  let deletedCount = 0;
  const uniqueLocalIds = [...new Set(localIds)];
  for (const localId of uniqueLocalIds) {
    const cachedTask = await getCachedTask(localId);
    if (!cachedTask || !isLocalOnlyTask(cachedTask)) {
      continue;
    }
    await deleteOfflineMutationsForTask(localId);
    await deleteCachedTask(localId);
    deletedCount += 1;
  }
  await hydrateCachedTasks();
  return deletedCount;
}

function pickBackupField(item, snakeName, camelName) {
  return item[snakeName] ?? item[camelName] ?? null;
}

function normalizeBackupText(value, maxLength) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeBackupStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return status === "completed" || status === "done" ? "completed" : "open";
}

function normalizeBackupPriority(value) {
  const priority = Number(value);
  if (!Number.isFinite(priority)) return 0;
  return Math.min(5, Math.max(0, Math.trunc(priority)));
}

function normalizeBackupSortOrder(value) {
  const sortOrder = Number(value);
  if (!Number.isFinite(sortOrder)) return 0;
  return Math.min(10_000, Math.max(0, Math.trunc(sortOrder)));
}

function normalizeBackupListType(value) {
  const listType = normalizeBackupText(value, 32) || "inbox";
  return /^[a-z0-9_-]{1,32}$/i.test(listType) ? listType : "inbox";
}

function normalizeBackupDate(value) {
  const text = normalizeBackupText(value, 32);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeBackupDateTime(value) {
  const text = normalizeBackupText(value, 64);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeBackupChecklist(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const title = normalizeBackupText(item?.title, 255);
      if (!title) return null;
      return {
        id: normalizeBackupText(item?.id, 128) || crypto.randomUUID(),
        title,
        done: Boolean(item?.done),
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function deleteDatabase(dbName) {
  return deleteIndexedDatabase(indexedDB, dbName, {
    onBlocked: () => setLocalDataStatus(t("app.localDataClearWaiting")),
  });
}

function setLocalDataStatus(message) {
  if (nodes.localDataMessage) {
    setStatus(nodes.localDataMessage, message);
  }
}

function isLocalStorageOperationError(error) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return /indexeddb|offline database|database is open|transaction|quota|storage|request|blocked|unknownerror|notfounderror|notreadableerror/i.test(
    `${name} ${message}`,
  );
}

function localOperationErrorMessage(error) {
  if (error instanceof ValidationError) {
    return validationErrorMessage(error);
  }
  if (isLocalStorageOperationError(error)) {
    return t("app.localDataUnavailable");
  }
  return normalizeError(error);
}

function renderViews() {
  nodes.viewButtons.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const view of PRIMARY_VIEW_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = view.value;
    button.className = state.view === view.value ? "active" : "";
    const count = getViewCount(view.value);
    button.textContent = `${getViewLabel(view.value)}${count > 0 ? ` · ${count}` : ""}`;
    fragment.appendChild(button);
  }
  nodes.viewButtons.appendChild(fragment);
  renderMoreViewSelect();
  renderTaskMetaFilters();
}

function renderMoreViewSelect() {
  if (!nodes.moreViewSelect) return;
  nodes.moreViewSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("view.moreFilters");
  nodes.moreViewSelect.appendChild(placeholder);
  for (const view of MORE_VIEW_OPTIONS) {
    const option = document.createElement("option");
    option.value = view.value;
    const count = getViewCount(view.value);
    option.textContent = `${getViewLabel(view.value)}${count > 0 ? ` · ${count}` : ""}`;
    nodes.moreViewSelect.appendChild(option);
  }
  nodes.moreViewSelect.value = MORE_VIEW_OPTIONS.some((view) => view.value === state.view) ? state.view : "";
}

function renderTaskMetaFilters() {
  if (!state.meta) return;
  const renderFilter = (node, values, allLabelKey, selectedValue) => {
    if (!node) return "";
    node.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = t(allLabelKey);
    node.appendChild(all);
    for (const value of Array.from(new Set([...(values || []), selectedValue].filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)))) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      node.appendChild(option);
    }
    node.value = selectedValue || "";
    return node.value;
  };
  const project = renderFilter(nodes.projectFilter, state.meta?.projects, "view.allProjects", state.projectFilter);
  const tag = renderFilter(nodes.tagFilter, state.meta?.tags, "view.allTags", state.tagFilter);
  if (project !== state.projectFilter || tag !== state.tagFilter) {
    state.projectFilter = project;
    state.tagFilter = tag;
    persistTaskListPreferences();
  }
}

function getViewLabel(value) {
  const option = VIEW_OPTIONS.find((item) => item.value === value);
  return option ? t(option.labelKey) : t("view.all");
}

function renderMeta() {
  if (!state.meta) {
    nodes.metaCounts.replaceChildren();
    return;
  }
  const counts = state.meta.counts || {};
  const chips = [
    ["open", counts.open],
    ["today", counts.today],
    ["inbox", counts.inbox],
    ["overdue", counts.overdue],
    ["completed", counts.completed],
    ["trash", counts.trash],
  ];
  nodes.metaCounts.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const [label, value] of chips) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = `${getMetaCountLabel(label)}: ${Number(value || 0)}`;
    fragment.appendChild(chip);
  }
  nodes.metaCounts.appendChild(fragment);
}

function getMetaCountLabel(key) {
  switch (key) {
    case "open":
      return t("meta.open");
    case "today":
      return getViewLabel("today");
    case "inbox":
      return getViewLabel("inbox");
    case "overdue":
      return getViewLabel("overdue");
    case "completed":
      return getViewLabel("completed");
    case "trash":
      return getViewLabel("trash");
    default:
      return t("meta.stats");
  }
}

function renderSyncStatus() {
  nodes.syncOverview.hidden = !shouldShowSyncSupportAction() && !state.offlineMode;
  if (state.offlineMode) {
    nodes.syncBadge.className = "badge badge-warning";
    nodes.syncBadge.textContent = t("connection.localMode");
    if (nodes.openSyncSupportButton) {
      nodes.openSyncSupportButton.hidden = true;
    }
    if (nodes.syncSummary) {
      nodes.syncSummary.textContent = t("auth.offlineModeActive");
    }
    if (nodes.syncNextStep) {
      nodes.syncNextStep.textContent = t("sync.nextStepSignIn");
    }
    nodes.syncDetails.replaceChildren();
    return;
  }
  if (!state.syncStatus) {
    nodes.syncBadge.className = "badge badge-neutral";
    nodes.syncBadge.textContent = "-";
    if (nodes.openSyncSupportButton) {
      nodes.openSyncSupportButton.hidden = !shouldShowSyncSupportAction();
    }
    if (nodes.syncSummary) {
      nodes.syncSummary.textContent = t("sync.noStatus");
    }
    if (nodes.syncNextStep) {
      nodes.syncNextStep.textContent = getSyncHealthNextStepText(null);
    }
    nodes.syncDetails.replaceChildren();
    return;
  }

  const { status, server_time: serverTime, limits } = state.syncStatus;
  nodes.syncBadge.className = `badge ${status === "ready" ? "badge-success" : "badge-warning"}`;
  nodes.syncBadge.textContent = getSyncHealthLabel(status);
  if (nodes.openSyncSupportButton) {
    nodes.openSyncSupportButton.hidden = !shouldShowSyncSupportAction();
  }
  if (nodes.syncSummary) {
    nodes.syncSummary.textContent = getSyncHealthActionText(status);
  }
  if (nodes.syncNextStep) {
    nodes.syncNextStep.textContent = getSyncHealthNextStepText(status);
  }

  const rows = [
    [getSyncHealthDetailLabel("action"), getSyncHealthActionText(status)],
    [t("app.syncNextStep").replace(/[:：].*$/, ""), getSyncHealthNextStepText(status)],
    [getSyncHealthDetailLabel("service"), getSyncServiceSummary(state.syncStatus)],
    [getSyncHealthDetailLabel("server_time"), serverTime ? formatDisplayDateTime(serverTime) : "-"],
  ];
  if (limits && typeof limits === "object") {
    rows.push([getSyncHealthDetailLabel("limits"), formatSyncLimits(limits)]);
  }
  nodes.syncDetails.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const [label, value] of rows) {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value ?? "-";
    item.append(dt, dd);
    fragment.appendChild(item);
  }
  nodes.syncDetails.appendChild(fragment);
}

function getSyncHealthLabel(value) {
  return value === "ready" ? t("sync.readyLabel") : t("sync.degradedLabel");
}

function getSyncHealthActionText(value) {
  return value === "ready"
    ? t("sync.readyAction")
    : t("sync.degradedAction");
}

function getSyncHealthNextStepText(value) {
  if (!value) {
    return t("sync.nextStepUnknown");
  }
  return value === "ready"
    ? t("sync.nextStepReady")
    : t("sync.nextStepNeedsCheck");
}

function getTaskSyncHealthText() {
  if (state.offlineMode) {
    return t("auth.offlineModeActive");
  }
  const issueCount = getTaskSyncHealthIssueCount();
  if (issueCount > 0) {
    return formatMessage("task.syncHealthNeedsReview", { count: issueCount });
  }
  if (!state.syncStatus?.status) {
    return t("task.syncHealthUnknown");
  }
  return state.syncStatus.status === "ready"
    ? t("task.syncHealthReady")
    : t("task.syncHealthDegraded");
}

function getTaskSyncHealthTone() {
  if (getTaskSyncHealthIssueCount() > 0 || (state.syncStatus?.status && state.syncStatus.status !== "ready")) {
    return "attention";
  }
  if (!state.syncStatus?.status) {
    return "unknown";
  }
  return "ready";
}

function shouldShowSyncSupportAction() {
  return !state.offlineMode && getTaskSyncHealthTone() === "attention";
}

function getTaskSyncHealthIssueCount() {
  const counts = state.meta?.counts || {};
  const issueTaskIds = new Set();
  for (const task of state.tasks) {
    if (
      task.offline_status === "pending_create" ||
      task.offline_status === "pending_update" ||
      task.offline_status === "pending_delete" ||
      task.offline_status === "sync_failed" ||
      task.offline_status === "conflict" ||
      hasOfflineQueueId(task.offline_queue_id)
    ) {
      issueTaskIds.add(String(task.id ?? task.local_id ?? task.offline_queue_id));
    }
  }
  return Math.max(
    issueTaskIds.size,
    Number(state.offlineQueueCount || 0),
    Number(counts.pending || 0) + Number(counts.conflict || 0),
  );
}

function renderTaskSyncHealthBar() {
  if (!nodes.taskSyncHealthBar || !nodes.taskSyncHealthText || !nodes.taskSyncHealthActionButton) return;
  const tone = getTaskSyncHealthTone();
  nodes.taskSyncHealthBar.hidden = tone === "ready" || tone === "unknown";
  nodes.taskSyncHealthBar.dataset.tone = tone;
  nodes.taskSyncHealthBar.classList.toggle("needs-attention", tone === "attention");
  nodes.taskSyncHealthBar.classList.toggle("is-unknown", tone === "unknown");
  nodes.taskSyncHealthText.textContent = getTaskSyncHealthText();
  nodes.taskSyncHealthActionButton.textContent = t("app.openSyncSupport");
  nodes.taskSyncHealthActionButton.hidden = !shouldShowSyncSupportAction();
}

function getSyncHealthDetailLabel(key) {
  switch (key) {
    case "action":
      return t("sync.action");
    case "service":
      return t("sync.service");
    case "server_time":
      return t("sync.serverTime");
    case "limits":
      return t("sync.limits");
    default:
      return t("sync.service");
  }
}

function getSyncServiceSummary(syncStatus) {
  const values = [syncStatus.database, syncStatus.redis, syncStatus.websocket].filter(Boolean);
  if (values.length === 0) {
    return getSyncHealthValueLabel(syncStatus.status);
  }
  return values.every((value) => ["ready", "ok", "connected"].includes(value))
    ? t("sync.serviceAvailable")
    : t("sync.serviceNeedsCheck");
}

function getSyncHealthValueLabel(value) {
  switch (value) {
    case "ready":
    case "ok":
    case "connected":
      return t("sync.normal");
    case "degraded":
      return t("sync.partiallyDegraded");
    case "offline":
    case "unavailable":
    case "error":
      return t("sync.unavailable");
    default:
      return value ? String(value) : "-";
  }
}

function formatDisplayDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "-");
  return new Intl.DateTimeFormat(state.language, {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
  }).format(date);
}

function formatSyncLimits(limits) {
  const values = Object.entries(limits)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${formatSyncLimitKey(key)} ${value}`);
  return values.length ? values.join(" / ") : "-";
}

function formatSyncLimitKey(key) {
  switch (key) {
    case "pull_limit":
    case "pullLimit":
    case "pull":
      return t("sync.pullLimit");
    case "push_limit":
    case "pushLimit":
    case "push":
      return t("sync.pushLimit");
    case "page_limit":
    case "pageLimit":
      return t("sync.pageLimit");
    case "max_pages":
    case "maxPages":
      return t("sync.maxPages");
    default:
      return String(key || t("sync.limit"))
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim() || t("sync.limit");
  }
}

function renderTasks() {
  const menuTaskId = activeTaskMenu?.taskId;
  const menuHadFocus = activeTaskMenu?.details.contains(document.activeElement);
  closeTaskActionMenu({ restoreFocus: false });
  reconcileTaskSelection();
  reconcileSelectedTrashTaskIds();
  renderTaskSelectionToolbar();
  nodes.taskList.replaceChildren();
  if (!state.tasks.length) {
    nodes.taskList.appendChild(renderEmptyTaskState());
    return;
  }

  const fragment = document.createDocumentFragment();
  if (state.view === "trash") {
    fragment.appendChild(renderTrashBulkActions());
  }
  for (const task of state.tasks) {
    fragment.appendChild(renderTaskItem(task));
  }
  nodes.taskList.appendChild(fragment);
  if (menuHadFocus) {
    const trigger = document.getElementById(`task-menu-trigger-${menuTaskId}`);
    (trigger || nodes.openTaskCreateButton)?.focus();
  }
  focusLinkedTask();
}

function reconcileTaskSelection() {
  if (!state.taskSelectionMode || state.view === "trash") {
    state.selectedTaskIds.clear();
    if (state.view === "trash") state.taskSelectionMode = false;
    return;
  }
  state.selectedTaskIds = reconcileSelectedTaskIds(state.selectedTaskIds, state.tasks);
}

function renderTaskSelectionToolbar() {
  if (!nodes.taskSelectionToolbar) return;
  const selectableIds = getSelectableTaskIds(state.tasks);
  const selectionAvailable = state.view !== "trash";
  const selectedCount = state.selectedTaskIds.size;

  nodes.enterTaskSelectionButton.hidden = !selectionAvailable;
  nodes.enterTaskSelectionButton.disabled = state.loading || selectableIds.length === 0;
  nodes.enterTaskSelectionButton.setAttribute("aria-pressed", String(state.taskSelectionMode));
  nodes.taskSelectionToolbar.hidden = !state.taskSelectionMode || !selectionAvailable;
  nodes.taskSelectionStatus.textContent = formatMessage("task.selectedCount", { count: selectedCount });
  nodes.selectAllVisibleTasksButton.disabled = state.loading || selectableIds.length === 0;
  nodes.completeSelectedTasksButton.disabled = state.loading || selectedCount === 0;
  nodes.deleteSelectedTasksButton.disabled = state.loading || selectedCount === 0;
  nodes.cancelTaskSelectionButton.disabled = state.loading;
}

function enterTaskSelectionMode() {
  if (state.view === "trash" || getSelectableTaskIds(state.tasks).length === 0) return;
  state.taskSelectionMode = true;
  reconcileTaskSelection();
  renderTasks();
}

function exitTaskSelectionMode() {
  state.taskSelectionMode = false;
  state.selectedTaskIds.clear();
  renderTasks();
}

function cancelTaskSelection() {
  exitTaskSelectionMode();
}

function selectAllVisibleTasks() {
  for (const taskId of getSelectableTaskIds(state.tasks)) {
    state.selectedTaskIds.add(taskId);
  }
  renderTasks();
}

function setTaskSelected(taskId, selected) {
  const normalizedId = String(taskId || "");
  if (!normalizedId || !getSelectableTaskIds(state.tasks).includes(normalizedId)) return;
  if (selected) {
    state.selectedTaskIds.add(normalizedId);
  } else {
    state.selectedTaskIds.delete(normalizedId);
  }
  renderTasks();
}

function selectedTasks() {
  return state.tasks.filter((task) => state.selectedTaskIds.has(String(task.id)));
}

function renderTrashBulkActions() {
  const item = document.createElement("li");
  item.className = "task-trash-bulk-actions";

  const summary = document.createElement("span");
  summary.className = "status-text";
  summary.textContent = formatMessage("task.selectedCount", { count: state.selectedTrashTaskIds.size });

  const actions = document.createElement("div");
  actions.className = "task-trash-bulk-actions__buttons";
  const hasSelection = state.selectedTrashTaskIds.size > 0;

  const restoreButton = document.createElement("button");
  restoreButton.type = "button";
  restoreButton.className = "secondary-button";
  restoreButton.dataset.trashBulkAction = "restore-selected";
  restoreButton.disabled = !hasSelection;
  restoreButton.textContent = t("task.restoreSelectedTrash");

  const purgeButton = document.createElement("button");
  purgeButton.type = "button";
  purgeButton.className = "secondary-button danger-outline-button";
  purgeButton.dataset.trashBulkAction = "purge-selected";
  purgeButton.disabled = !hasSelection;
  purgeButton.textContent = t("task.purgeSelectedTrash");

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "text-button";
  clearButton.dataset.trashBulkAction = "clear-selection";
  clearButton.disabled = !hasSelection;
  clearButton.textContent = t("task.clearSelection");

  actions.append(restoreButton, purgeButton, clearButton);
  item.append(summary, actions);
  return item;
}

function reconcileSelectedTrashTaskIds() {
  if (state.view !== "trash") {
    state.selectedTrashTaskIds.clear();
    return;
  }
  const visibleTrashIds = new Set(state.tasks.filter((task) => task.is_deleted).map((task) => String(task.id)));
  for (const taskId of [...state.selectedTrashTaskIds]) {
    if (!visibleTrashIds.has(taskId)) {
      state.selectedTrashTaskIds.delete(taskId);
    }
  }
}

function setTrashTaskSelected(taskId, selected) {
  const normalizedId = String(taskId || "");
  if (!normalizedId) return;
  if (selected) {
    state.selectedTrashTaskIds.add(normalizedId);
  } else {
    state.selectedTrashTaskIds.delete(normalizedId);
  }
  renderTasks();
}

function selectedTrashTasks() {
  return state.tasks.filter((task) => task.is_deleted && state.selectedTrashTaskIds.has(String(task.id)));
}

function clearSelectedTrashTasks() {
  state.selectedTrashTaskIds.clear();
  renderTasks();
}

function renderEmptyTaskState() {
  const empty = document.createElement("li");
  empty.className = "task-item task-empty-state";
  const activeSearch = Boolean(state.search);
  const emptyAction = getEmptyTaskStateAction(activeSearch);

  const title = document.createElement("strong");
  title.className = "task-empty-title";
  title.textContent = activeSearch
    ? t("task.emptySearchTitle")
    : formatMessage("task.emptyViewTitle", { view: getViewLabel(state.view) });

  const hint = document.createElement("span");
  hint.className = "task-empty-hint";
  hint.textContent = t(emptyAction.hintKey);

  const action = document.createElement("button");
  action.type = "button";
  action.className = "text-button task-empty-action";
  action.textContent = t(emptyAction.labelKey);
  action.addEventListener("click", () => {
    if (emptyAction.kind === "clear-search") {
      nodes.taskSearch.value = "";
      state.search = "";
      resetOfflineTaskRenderLimit();
      persistTaskListPreferences();
      void refreshTasks();
      return;
    }
    if (emptyAction.kind === "clear-filter") {
      resetTaskListFilters();
      return;
    }
    if (emptyAction.kind === "create") {
      openTaskCreatePanel({ focusTitle: true });
    }
  });

  empty.append(title, hint, action);
  return empty;
}

function getEmptyTaskStateAction(activeSearch) {
  if (activeSearch) {
    return {
      kind: "clear-search",
      hintKey: "task.emptySearchHint",
      labelKey: "task.clearSearch",
    };
  }
  if (EMPTY_STATE_CREATE_VIEWS.has(state.view)) {
    return {
      kind: "create",
      hintKey: "task.emptyViewHint",
      labelKey: "task.newTask",
    };
  }
  return {
    kind: "clear-filter",
    hintKey: "task.emptyFilteredHint",
    labelKey: "task.clearFilter",
  };
}

function renderTaskItem(task) {
  const completed = isCompletedTask(task);
  const item = document.createElement("li");
  item.className = "task-item";
  item.dataset.taskId = String(task.id);
  item.id = `task-${String(task.id).replace(/[^A-Za-z0-9_-]/g, "-")}`;
  if (state.editingTaskId === task.id) {
    item.classList.add("is-editing");
  }
  if (task.is_deleted) {
    item.classList.add("is-deleted");
  }
  if (task.offline_status) {
    item.classList.add("is-offline-pending");
  }

  const titleRow = document.createElement("div");
  titleRow.className = "task-item__title";

  if (state.taskSelectionMode && getSelectableTaskIds([task]).length > 0) {
    const selectionLabel = document.createElement("label");
    selectionLabel.className = "task-selection";
    const selection = document.createElement("input");
    selection.type = "checkbox";
    const data = selection.dataset;
    data.taskSelectionId = String(task.id);
    selection.checked = state.selectedTaskIds.has(String(task.id));
    selection.setAttribute("aria-label", formatMessage("task.selectTaskFor", {
      title: task.title || t("task.untitled"),
    }));
    selectionLabel.appendChild(selection);
    titleRow.appendChild(selectionLabel);
    if (selection.checked) item.classList.add("is-selected");
  }

  if (task.is_deleted) {
    const selectionLabel = document.createElement("label");
    selectionLabel.className = "task-selection";
    const selection = document.createElement("input");
    selection.type = "checkbox";
    selection.dataset.trashSelectionId = String(task.id);
    selection.checked = state.selectedTrashTaskIds.has(String(task.id));
    selection.setAttribute("aria-label", `${t("task.selectTask")}: ${task.title || t("task.untitled")}`);
    selectionLabel.append(selection, document.createTextNode(t("task.select")));
    titleRow.appendChild(selectionLabel);
  }

  const title = document.createElement("h3");
  title.textContent = task.title;
  titleRow.appendChild(title);

  const status = document.createElement("span");
  status.className = `badge ${
    task.offline_status ? "badge-warning" : completed ? "badge-success" : task.is_deleted ? "badge-warning" : "badge-neutral"
  }`;
  status.textContent = getLocalizedTaskStatusLabel(task);
  item.appendChild(titleRow);

  if (task.content) {
    const content = document.createElement("p");
    content.className = "task-item__content";
    content.textContent = task.content;
    content.id = `${item.id}-content`;
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "text-button task-note-toggle";
    expand.dataset.taskAction = "view-details";
    expand.dataset.taskId = String(task.id);
    expand.textContent = t("task.expandNote");
    expand.setAttribute("aria-expanded", "false");
    expand.setAttribute("aria-controls", content.id);
    expand.addEventListener("click", () => {
      const expanded = content.classList.toggle("is-expanded");
      expand.textContent = t(expanded ? "task.collapseNote" : "task.expandNote");
      expand.setAttribute("aria-expanded", String(expanded));
    });
    item.append(content, expand);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.appendChild(status);
  for (const chip of buildTaskMeta(task)) {
    meta.appendChild(chip);
  }
  item.appendChild(meta);

  if (task.offline_status === "conflict") {
    item.appendChild(renderConflictResolution(task));
  } else if (task.offline_status === "sync_failed") {
    item.appendChild(renderFailedSyncRecovery(task));
  }

  const actions = document.createElement("div");
  actions.className = "task-actions task-actions--primary";
  const primary = document.createElement("button");
  primary.type = "button";
  primary.dataset.taskId = String(task.id);
  primary.dataset.taskAction = task.is_deleted ? "restore" : completed ? "undo-complete" : "complete";
  primary.textContent = t(task.is_deleted ? "task.restore" : completed ? "task.undoComplete" : "task.complete");
  primary.setAttribute("aria-label", `${primary.textContent}: ${task.title || t("task.untitled")}`);
  actions.append(primary, renderTaskActionMenu(task));
  titleRow.appendChild(actions);
  return item;
}

function renderFailedSyncRecovery(task) {
  const panel = document.createElement("section");
  panel.className = "sync-failed-recovery";

  const message = document.createElement("p");
  message.textContent = t("sync.failedMessage");
  panel.appendChild(message);
  if (task.offline_error) {
    const error = document.createElement("p");
    error.className = "sync-failed-recovery__error";
    error.textContent = normalizeUserFacingError(task.offline_error);
    panel.appendChild(error);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions sync-failed-recovery__actions";
  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.dataset.taskAction = "retry-sync";
  retryButton.dataset.taskId = String(task.id);
  retryButton.textContent = t("sync.retryFailed");
  actions.appendChild(retryButton);

  const discardButton = document.createElement("button");
  discardButton.type = "button";
  discardButton.className = "secondary-button danger-outline-button";
  discardButton.dataset.taskAction = "discard-sync";
  discardButton.dataset.taskId = String(task.id);
  discardButton.textContent = t("sync.discardFailed");
  actions.appendChild(discardButton);
  panel.appendChild(actions);
  return panel;
}

function renderTaskActionMenu(task) {
  const details = document.createElement("details");
  details.className = "task-action-menu";
  const summary = document.createElement("summary");
  summary.id = `task-menu-trigger-${task.id}`;
  summary.textContent = t("task.moreActions");
  summary.setAttribute("aria-label", formatMessage("task.moreActionsFor", { title: task.title || t("task.untitled") }));
  summary.setAttribute("aria-haspopup", "menu");
  summary.setAttribute("aria-expanded", "false");
  summary.setAttribute("aria-controls", `task-menu-${task.id}`);
  details.appendChild(summary);
  const open = () => {
    if (activeTaskMenu?.details === details) return;
    closeTaskActionMenu({ restoreFocus: false });
    details.open = true;
    const content = renderTaskMenuItems(task);
    details.appendChild(content);
    summary.setAttribute("aria-expanded", "true");
    activeTaskMenu = { details, summary, content, taskId: task.id };
    positionTaskActionMenu();
  };
  summary.addEventListener("click", (event) => {
    event.preventDefault();
    if (activeTaskMenu?.details === details) closeTaskActionMenu();
    else open();
  });
  summary.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    open();
    const items = taskMenuItems();
    (event.key === "ArrowUp" ? items.at(-1) : items[0])?.focus();
  });
  details.addEventListener("toggle", () => {
    if (details.open) open();
    else if (activeTaskMenu?.details === details) closeTaskActionMenu();
  });
  return details;
}

function renderTaskMenuItems(task) {
  const content = document.createElement("div");
  content.id = `task-menu-${task.id}`;
  content.className = "task-action-menu__items";
  content.setAttribute("role", "menu");
  content.setAttribute("aria-labelledby", `task-menu-trigger-${task.id}`);
  const actions = task.is_deleted ? [["purge", "task.purge"]] : [
    ["edit", "task.edit"],
    ...(!isCompletedTask(task) ? [
      ["plan-today", "task.planToday"],
      ["plan-tomorrow", "task.planTomorrow"],
      ["snooze-later", "task.snoozeLater"],
    ] : []),
    ...(task.is_template ? [["instantiate-template", "task.useTemplate"]] : []),
    ["delete", "task.delete"],
  ];
  for (const [action, labelKey] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.taskAction = action;
    button.dataset.taskId = String(task.id);
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.textContent = t(labelKey);
    content.appendChild(button);
  }
  return content;
}

function closeTaskActionMenu({ restoreFocus = true } = {}) {
  if (!activeTaskMenu) return;
  const { details, summary, content } = activeTaskMenu;
  activeTaskMenu = null;
  details.open = false;
  summary.setAttribute("aria-expanded", "false");
  content.remove();
  if (restoreFocus && summary.isConnected) summary.focus();
}

function taskMenuItems() {
  return activeTaskMenu ? [...activeTaskMenu.content.querySelectorAll("button:not([disabled])")] : [];
}

function handleTaskMenuKeydown(event) {
  if (!activeTaskMenu) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    closeTaskActionMenu();
    return true;
  }
  if (event.key === "Tab") {
    closeTaskActionMenu();
    return false;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  event.preventDefault();
  const items = taskMenuItems();
  const index = items.indexOf(document.activeElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
    : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
  return true;
}

function scheduleTaskMenuPosition() {
  if (!activeTaskMenu || taskMenuPositionScheduled) return;
  taskMenuPositionScheduled = true;
  window.requestAnimationFrame(() => {
    taskMenuPositionScheduled = false;
    positionTaskActionMenu();
  });
}

function positionTaskActionMenu() {
  if (!activeTaskMenu) return;
  const { summary, content } = activeTaskMenu;
  const anchor = summary.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8;
  const gap = 6;
  if (anchor.bottom <= 0 || anchor.top >= viewportHeight || !summary.isConnected) {
    closeTaskActionMenu({ restoreFocus: false });
    return;
  }
  content.style.maxHeight = "";
  const rect = content.getBoundingClientRect();
  const below = Math.max(0, viewportHeight - anchor.bottom - margin - gap);
  const above = Math.max(0, anchor.top - margin - gap);
  const flip = rect.height > below && above > below;
  const available = flip ? above : below;
  const top = flip ? anchor.top - Math.min(rect.height, available) - gap : anchor.bottom + gap;
  content.dataset.placement = flip ? "top" : "bottom";
  content.style.maxHeight = `${available}px`;
  content.style.left = `${Math.max(margin, Math.min(anchor.right - rect.width, viewportWidth - rect.width - margin))}px`;
  content.style.top = `${Math.max(margin, top)}px`;
}

function makeConflictDecisionNote(label, text) {
  const note = document.createElement("p");
  note.className = "conflict-resolution__decision";
  const strong = document.createElement("strong");
  strong.textContent = `${label}：`;
  note.append(strong, document.createTextNode(text));
  return note;
}

function renderConflictResolution(task) {
  const panel = document.createElement("div");
  panel.className = "conflict-resolution";

  const message = document.createElement("p");
  message.className = "conflict-resolution__message";
  message.textContent = t("sync.conflictMessage");
  panel.appendChild(message);

  if (task.offline_error) {
    const error = document.createElement("p");
    error.className = "conflict-resolution__error";
    error.textContent = normalizeUserFacingError(task.offline_error);
    panel.appendChild(error);
  }

  panel.appendChild(renderConflictSnapshotSummary(task));

  const decisionList = document.createElement("div");
  decisionList.className = "conflict-resolution__decision-list";
  decisionList.append(
    makeConflictDecisionNote(t("sync.useServer"), t("sync.useServerConsequence")),
    makeConflictDecisionNote(t("sync.overwriteServer"), t("sync.overwriteServerConsequence")),
  );
  panel.appendChild(decisionList);

  const actions = document.createElement("div");
  actions.className = "task-actions conflict-resolution__actions";

  const useCloud = document.createElement("button");
  useCloud.type = "button";
  useCloud.dataset.taskAction = "use-cloud-conflict";
  useCloud.dataset.taskId = String(task.id);
  useCloud.textContent = t("sync.useServer");
  useCloud.disabled = !canResolveTaskConflict(task);
  actions.appendChild(useCloud);

  const overwriteCloud = document.createElement("button");
  overwriteCloud.type = "button";
  overwriteCloud.dataset.taskAction = "overwrite-cloud-conflict";
  overwriteCloud.dataset.taskId = String(task.id);
  overwriteCloud.textContent = t("sync.overwriteServer");
  overwriteCloud.disabled = !canResolveTaskConflict(task);
  actions.appendChild(overwriteCloud);

  panel.appendChild(actions);

  if (!canResolveTaskConflict(task)) {
    const hint = document.createElement("p");
    hint.className = "conflict-resolution__hint";
    hint.textContent = t("sync.noServerVersion");
    panel.appendChild(hint);
  }

  return panel;
}

function renderConflictSnapshotSummary(task) {
  const summary = document.createElement("div");
  summary.className = "conflict-resolution__snapshot conflict-resolution__comparison";

  const localSnapshot = getConflictLocalSnapshot(task);
  const cloudSnapshot = getConflictCloudSnapshot(task);
  const detailRows = buildConflictDetailRows(task);
  summary.appendChild(
    makeConflictComparisonCard(
      t("sync.localVersion"),
      conflictSnapshotTitle(localSnapshot, task.title),
      detailRows,
      "localValue",
    ),
  );
  summary.appendChild(
    makeConflictComparisonCard(
      t("sync.serverVersion"),
      cloudSnapshot ? conflictSnapshotTitle(cloudSnapshot, t("sync.untitledTask")) : t("sync.previewUnavailable"),
      detailRows,
      "cloudValue",
      !cloudSnapshot,
    ),
  );

  if (!detailRows.length) {
    const details = document.createElement("p");
    details.className = "conflict-resolution__details";
    details.textContent = `${t("sync.differences")}：${t("sync.differencesUnavailable")}`;
    summary.appendChild(details);
  }

  return summary;
}

function makeConflictSnapshotRow(label, value, muted = false) {
  const row = document.createElement("p");
  row.className = "conflict-resolution__snapshot-row";
  if (muted) row.classList.add("is-muted");

  const strong = document.createElement("strong");
  strong.textContent = `${label}：`;
  row.appendChild(strong);
  row.append(document.createTextNode(value || t("sync.untitledTask")));
  return row;
}

function makeConflictComparisonCard(label, title, rows, valueKey, muted = false) {
  const card = document.createElement("section");
  card.className = "conflict-resolution__card";
  if (muted) card.classList.add("is-muted");

  const heading = document.createElement("h4");
  heading.textContent = label;
  card.appendChild(heading);

  const titleNode = document.createElement("p");
  titleNode.className = "conflict-resolution__card-title";
  titleNode.textContent = title || t("sync.untitledTask");
  card.appendChild(titleNode);

  if (rows.length) {
    const list = document.createElement("dl");
    list.className = "conflict-resolution__fields";
    for (const row of rows) {
      const item = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = row.label;
      const value = document.createElement("dd");
      value.textContent = compactConflictValue(row[valueKey]);
      item.append(term, value);
      list.appendChild(item);
    }
    card.appendChild(list);
  }

  return card;
}

function buildConflictDetailRows(task) {
  const localSnapshot = getConflictLocalSnapshot(task);
  const cloudSnapshot = getConflictCloudSnapshot(task);
  if (!localSnapshot && !cloudSnapshot) return [];

  const fields = [
    [t("sync.content"), ["content"]],
    [t("sync.due"), ["due_time", "dueTime"]],
    [t("sync.plan"), ["planned_date", "plannedDate"]],
    [t("sync.reminder"), ["remind_time", "remindTime"]],
    [t("sync.repeat"), ["repeat_rule", "repeatRule"], "repeat"],
    [t("sync.tag"), ["tag"]],
    [t("sync.project"), ["project"]],
    [t("sync.checklist"), ["checklist", "checklistJson"], "checklist"],
  ];

  return fields
    .map(([label, keys, type]) => {
      const localValue = snapshotConflictFieldValue(localSnapshot, keys, type);
      const cloudValue = snapshotConflictFieldValue(cloudSnapshot, keys, type);
      if (localValue === cloudValue || (!localValue && !cloudValue)) return null;
      return { label, localValue, cloudValue };
    })
    .filter(Boolean);
}

function buildConflictDetailLabels(task) {
  return buildConflictDetailRows(task).map((row) => row.label);
}

function snapshotConflictFieldValue(snapshot, keys, type) {
  if (type === "checklist") return snapshotChecklistSummary(snapshot, keys);
  if (type === "repeat") return snapshotRepeatRuleLabel(snapshot, keys);
  return snapshotText(snapshot, keys);
}

function getConflictLocalSnapshot(task) {
  return (
    parseConflictSnapshot(task?.conflictLocalJson) ||
    parseConflictSnapshot(task?.conflict_local_json) ||
    parseConflictSnapshot(task?.offline_conflict_local_json) ||
    task ||
    null
  );
}

function getConflictCloudSnapshot(task) {
  return (
    parseConflictSnapshot(task?.conflictServerJson) ||
    parseConflictSnapshot(task?.conflict_server_json) ||
    parseConflictSnapshot(task?.offline_conflict_server_json) ||
    parseConflictSnapshot(task?.server_task) ||
    null
  );
}

function parseConflictSnapshot(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function conflictSnapshotTitle(snapshot, fallback) {
  const title = snapshotText(snapshot, ["title"]);
  return title || fallback || t("task.untitled");
}

function snapshotText(snapshot, keys) {
  if (!snapshot || typeof snapshot !== "object") return "";
  for (const key of keys) {
    const value = snapshot[key];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) return value.length ? formatMessage("task.items", { count: value.length }) : "";
    if (typeof value === "object") return Object.keys(value).length ? JSON.stringify(value) : "";
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function snapshotRepeatRuleLabel(snapshot, keys) {
  const value = snapshotText(snapshot, keys);
  if (!value) return "";
  switch (value.toLowerCase()) {
    case "daily":
      return t("task.repeatDaily");
    case "weekly":
      return t("task.repeatWeekly");
    case "monthly":
      return t("task.repeatMonthly");
    default:
      return value;
  }
}

function snapshotChecklistSummary(snapshot, keys) {
  if (!snapshot || typeof snapshot !== "object") return "";
  for (const key of keys) {
    const rawValue = snapshot[key];
    const items = parseChecklistItems(rawValue);
    if (!items.length) continue;
    const completed = items.filter((item) => item && typeof item === "object" && (item.done || item.completed || item.checked)).length;
    return formatMessage("task.items", { count: `${completed}/${items.length}` });
  }
  return "";
}

function parseChecklistItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function compactConflictValue(value) {
  if (!value) return "-";
  return value.length > 32 ? `${value.slice(0, 32)}...` : value;
}

function buildTaskMeta(task) {
  const labels = [];
  if (task.project) labels.push(formatMessage("task.projectPreview", { value: task.project }));
  if (task.tag) labels.push(`#${task.tag}`);
  if (task.list_type) labels.push(getViewLabel(task.list_type));
  const priorityLabel = getLocalizedPriorityLabel(task.priority);
  if (priorityLabel) labels.push(priorityLabel);
  if (task.planned_date) labels.push(formatMessage("task.planPreview", { value: task.planned_date }));
  if (task.due_time) labels.push(formatMessage("task.duePreview", { value: formatDisplayDateTime(task.due_time) }));
  if (task.remind_time) labels.push(formatMessage("task.reminderPreview", { value: formatDisplayDateTime(task.remind_time) }));
  if (task.snoozed_until) labels.push(formatMessage("task.snoozePreview", { value: formatDisplayDateTime(task.snoozed_until) }));
  if (task.completed_at) labels.push(formatMessage("task.completedPreview", { value: formatDisplayDateTime(task.completed_at) }));
  const checklistCount = parseChecklistItems(task.checklist || task.checklist_json).length;
  if (checklistCount > 0) labels.push(formatMessage("task.checklistPreview", { count: checklistCount }));
  const statusLabel = getLocalizedTaskStatusLabel(task);
  if (![t("task.statusInProgress"), t("task.statusCompleted"), t("task.statusDeleted")].includes(statusLabel)) {
    labels.push(statusLabel);
  }
  return labels.map(makeChip);
}

function getLocalizedPriorityLabel(priority) {
  const normalized = Math.trunc(Number(priority || 0));
  switch (normalized) {
    case 1:
      return t("task.priorityLow");
    case 2:
      return t("task.priorityMedium");
    case 3:
      return t("task.priorityHigh");
    case 4:
      return t("task.priorityUrgent");
    case 5:
      return t("task.priorityHighest");
    default:
      return "";
  }
}

function getLocalizedTaskStatusLabel(task) {
  if (task.offline_status === "conflict") return t("task.statusConflict");
  if (task.offline_error) return t("task.statusSyncFailed");
  if (task.offline_status || hasOfflineQueueId(task.offline_queue_id)) return t("task.statusPendingSync");
  if (task.is_deleted) return t("task.statusDeleted");
  if (isCompletedTask(task)) return t("task.statusCompleted");
  return t("task.statusInProgress");
}

function makeChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

function getConfirmFocusableElements() {
  return [nodes.confirmDialogCancelButton, nodes.confirmDialogConfirmButton].filter(
    (element) => element && !element.disabled && !element.hidden,
  );
}

function confirmUserAction(options = {}) {
  if (!nodes.confirmDialog) {
    return Promise.resolve(false);
  }
  if (activeConfirm) {
    activeConfirm.resolve(false);
    activeConfirm = null;
  }
  const {
    title = t("confirm.title"),
    message = t("confirm.message"),
    confirmText = t("confirm.confirm"),
    cancelText = t("confirm.cancel"),
    danger = false,
  } = options;
  const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  nodes.confirmDialogTitle.textContent = title;
  nodes.confirmDialogMessage.textContent = message;
  nodes.confirmDialogConfirmButton.textContent = confirmText;
  nodes.confirmDialogCancelButton.textContent = cancelText;
  nodes.confirmDialogConfirmButton.classList.toggle("danger-button", Boolean(danger));
  nodes.confirmDialog.hidden = false;
  (danger ? nodes.confirmDialogCancelButton : nodes.confirmDialogConfirmButton).focus();

  return new Promise((resolve) => {
    const cleanup = (result) => {
      nodes.confirmDialog.hidden = true;
      nodes.confirmDialogConfirmButton.onclick = null;
      nodes.confirmDialogCancelButton.onclick = null;
      nodes.confirmDialog.onclick = null;
      document.removeEventListener("keydown", onKeyDown);
      activeConfirm = null;
      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement?.focus();
      }
      resolve(result);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        cleanup(false);
        return;
      }
      if (event.key === "Tab") {
        const focusableElements = getConfirmFocusableElements();
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (!firstElement || !lastElement) return;
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };
    activeConfirm = { resolve: cleanup };
    nodes.confirmDialogConfirmButton.onclick = () => cleanup(true);
    nodes.confirmDialogCancelButton.onclick = () => cleanup(false);
    nodes.confirmDialog.onclick = (event) => {
      if (event.target === nodes.confirmDialog) {
        cleanup(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
  });
}

async function confirmTaskAction(task, action) {
  if (!shouldConfirmTaskAction(action)) return true;
  const title = task?.title ? `「${task.title}」` : t("task.thisTask");
  return confirmUserAction({
    title: t("confirm.deleteTaskTitle"),
    message: formatMessage("confirm.deleteTaskMessage", { title }),
    confirmText: t("task.delete"),
    danger: true,
  });
}

function renderSummary() {
  const count = state.tasks.length;
  const viewLabel = getViewLabel(state.view);
  const searchLabel = state.search ? formatMessage("task.summarySearch", { query: state.search }) : "";
  const queueLabel = state.offlineQueueCount > 0 ? formatMessage("task.summaryQueue", { count: state.offlineQueueCount }) : "";
  nodes.taskSummary.textContent = formatMessage("task.summary", {
    view: viewLabel,
    count,
    search: searchLabel,
    queue: queueLabel,
  });
}

function renderOfflineTaskLimitNotice() {
  if (!nodes.offlineTaskLimitNotice) return;
  const shouldShow = state.cachedTaskListLimited && state.cachedTaskTotalCount > state.cachedTaskVisibleCount;
  const noticeText = nodes.offlineTaskLimitText || nodes.offlineTaskLimitNotice;
  nodes.offlineTaskLimitNotice.hidden = !shouldShow;
  noticeText.textContent = shouldShow
    ? formatMessage("task.offlineLimitNotice", {
        total: state.cachedTaskTotalCount,
        visible: state.cachedTaskVisibleCount,
      })
    : "";
  if (nodes.offlineTaskLimitLoadMoreButton) {
    nodes.offlineTaskLimitLoadMoreButton.hidden = !shouldShow;
  }
}

function resetOfflineTaskRenderLimit() {
  state.offlineTaskRenderLimit = TASK_LIMIT;
}

async function increaseOfflineTaskRenderLimit() {
  const nextLimit = state.offlineTaskRenderLimit + OFFLINE_TASK_RENDER_STEP;
  state.offlineTaskRenderLimit = state.cachedTaskTotalCount > 0 ? Math.min(nextLimit, state.cachedTaskTotalCount) : nextLimit;
  await hydrateCachedTasks();
}

function getActiveTaskFilterLabels() {
  const labels = [];
  if (state.view) {
    labels.push(getViewLabel(state.view));
  }
  if (state.search) {
    labels.push(formatMessage("task.searchFilter", { query: state.search }));
  }
  if (state.projectFilter) labels.push(`${t("view.project")}: ${state.projectFilter}`);
  if (state.tagFilter) labels.push(`${t("view.tag")}: ${state.tagFilter}`);
  return labels;
}

function renderActiveTaskFilters() {
  if (!nodes.taskFilterSummary || !nodes.taskActiveFilterChips) return;
  const labels = getActiveTaskFilterLabels();
  nodes.taskFilterSummary.hidden = labels.length === 0;
  nodes.taskActiveFilterChips.replaceChildren();
  for (const label of labels) {
    const chip = document.createElement("span");
    chip.className = "active-filter-chip";
    chip.textContent = label;
    nodes.taskActiveFilterChips.appendChild(chip);
  }
}

function resetTaskListFilters() {
  nodes.taskSearch.value = "";
  state.search = "";
  state.view = "";
  state.projectFilter = "";
  state.tagFilter = "";
  if (nodes.projectFilter) nodes.projectFilter.value = "";
  if (nodes.tagFilter) nodes.tagFilter.value = "";
  resetOfflineTaskRenderLimit();
  if (nodes.moreViewSelect) nodes.moreViewSelect.value = "";
  persistTaskListPreferences();
  renderViews();
  renderActiveTaskFilters();
  void refreshTasks();
}

function captureSessionContext() {
  return {
    generation: sessionRefreshGeneration,
    apiBaseUrl: state.apiBaseUrl,
    deviceId: state.deviceId,
    userId: getCurrentUserId(),
  };
}

function isSessionContextCurrent(context) {
  return Boolean(context) &&
    context.generation === sessionRefreshGeneration &&
    context.apiBaseUrl === state.apiBaseUrl &&
    context.deviceId === state.deviceId &&
    (context.userId === null || context.userId === getCurrentUserId());
}

async function activateSession(sessionContext) {
  if (!isSessionContextCurrent(sessionContext) || !hasSession()) return false;
  try {
    const user = await apiRequest("/auth/me");
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (sessionContext.userId !== null && Number(user?.id) !== sessionContext.userId) return false;
    state.user = user;
    sessionContext.userId = getCurrentUserId();
    persistOfflineProfile(state.user);
    await refreshAll(sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (!restoreTaskDraft()) {
      applyTaskCreatePresetForCurrentView();
    }
  } catch (error) {
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (error instanceof ApiError && isTerminalRefreshStatus(error.status) && !hasSession()) {
      setStatus(nodes.authMessage, t("error.sessionExpired"));
      render();
      return false;
    }
    if (isOfflineCapableError(error) && state.user) {
      await hydrateCachedTasks({ sessionContext });
      if (!isSessionContextCurrent(sessionContext)) return false;
      state.meta = buildLocalMeta(state.tasks, new Date(), { timeZone: DISPLAY_TIME_ZONE });
      setStatus(nodes.taskMessage, t("task.offlineCachedSyncLater"));
      if (!restoreTaskDraft()) {
        applyTaskCreatePresetForCurrentView();
      }
      render();
      return true;
    }
    clearSession();
    setStatus(nodes.authMessage, normalizeAuthError(error));
    render();
    return false;
  }
  render();
  return true;
}

async function activateSessionSingleflight(sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext) || !hasSession()) return false;
  if (!sessionActivationPromise || !isSessionContextCurrent(sessionActivationContext)) {
    sessionActivationContext = sessionContext;
    const request = activateSession(sessionContext).finally(() => {
      if (sessionActivationPromise === request) {
        sessionActivationPromise = null;
        sessionActivationContext = null;
      }
    });
    sessionActivationPromise = request;
  }
  return sessionActivationPromise;
}

async function refreshAll(sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return false;
  setBusy(true);
  try {
    if (state.offlineMode) {
      await hydrateCachedTasks({ sessionContext });
      if (!isSessionContextCurrent(sessionContext)) return false;
      setStatus(nodes.taskMessage, t("auth.offlineModeActive"));
      render();
      return true;
    }
    await flushOfflineQueue(sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    await Promise.all([
      refreshProfile(sessionContext),
      refreshMeta(sessionContext),
      refreshTasks(sessionContext),
      refreshSyncStatus({ sessionContext }),
    ]);
    if (!isSessionContextCurrent(sessionContext)) return false;
    render();
    return true;
  } finally {
    if (isSessionContextCurrent(sessionContext)) setBusy(false);
  }
}

async function refreshProfile(sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return false;
  try {
    const user = await apiRequest("/auth/me");
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (sessionContext.userId !== null && Number(user?.id) !== sessionContext.userId) return false;
    state.user = user;
    writeSessionJson("user", state.user);
    persistOfflineProfile(state.user);
  } catch (error) {
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (isOfflineCapableError(error) && state.user) {
      return;
    }
    throw error;
  }
}

async function refreshMeta(sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return false;
  if (state.offlineMode) {
    const tasks = await listCachedTasks();
    if (!isSessionContextCurrent(sessionContext)) return false;
    state.meta = buildLocalMeta(tasks, new Date(), { timeZone: DISPLAY_TIME_ZONE });
    renderMeta();
    return;
  }
  try {
    const params = new URLSearchParams({ timezone: DISPLAY_TIME_ZONE });
    let meta = await apiRequest(`/tasks/meta?${params.toString()}`);
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (supportsIndexedDb() && getCurrentUserId()) {
      try {
        const tasks = await listCachedTasks();
        if (!isSessionContextCurrent(sessionContext)) return false;
        const localMeta = buildLocalMeta(tasks, new Date(), { timeZone: DISPLAY_TIME_ZONE });
        meta = {
          ...meta,
          counts: {
            ...(meta?.counts || {}),
            pending: localMeta.counts.pending,
            conflict: localMeta.counts.conflict,
          },
        };
      } catch {
        // Remote metadata remains useful if the browser cache is temporarily unavailable.
      }
    }
    if (!isSessionContextCurrent(sessionContext)) return false;
    await writeOfflineMeta("tasks_meta", meta, sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    state.meta = meta;
  } catch (error) {
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (isOfflineCapableError(error)) {
      const cachedMeta = await readOfflineMeta("tasks_meta");
      if (!isSessionContextCurrent(sessionContext)) return false;
      state.meta = cachedMeta || buildLocalMeta(
        state.tasks,
        new Date(),
        { timeZone: DISPLAY_TIME_ZONE },
      );
      renderMeta();
      return;
    }
    throw error;
  }
}

async function refreshTasks(sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return false;
  const requestSequence = taskRequestGate.begin();
  const isCurrent = () => isSessionContextCurrent(sessionContext) && taskRequestGate.isCurrent(requestSequence);
  const viewContext = {
    view: state.view,
    search: state.search,
    project: state.projectFilter,
    tag: state.tagFilter,
    now: new Date(),
    timeZone: DISPLAY_TIME_ZONE,
  };
  const serverView = mapTaskViewForServer(viewContext.view);
  if (state.offlineMode || serverView === null) {
    const applied = await hydrateCachedTasks({ viewContext, requestSequence, sessionContext });
    if (applied && state.offlineMode) {
      setStatus(nodes.taskMessage, t("auth.offlineModeActive"));
    }
    return;
  }
  const params = new URLSearchParams();
  params.set("limit", String(TASK_LIMIT));
  params.set("timezone", DISPLAY_TIME_ZONE);
  if (viewContext.search) params.set("q", viewContext.search);
  if (viewContext.project) params.set("project", viewContext.project);
  if (viewContext.tag) params.set("tag", viewContext.tag);
  if (serverView && serverView !== "trash") {
    params.set("view", serverView);
  }
  try {
    const remoteTasks =
      viewContext.view === "trash"
        ? await apiRequest(`/tasks/trash?${params.toString()}`)
        : await fetchTaskListPages(params, sessionContext);
    if (!isCurrent()) return;
    const reconciledTasks = await cacheTasksForOffline(remoteTasks, viewContext, {
      isCurrent,
    });
    if (!reconciledTasks || !isCurrent()) return;
    state.tasks = reconciledTasks
      .filter((task) => matchesTaskView(task, viewContext))
      .sort((left, right) => compareCachedTasks(left, right, viewContext));
    state.cachedTaskTotalCount = 0;
    state.cachedTaskVisibleCount = 0;
    state.cachedTaskListLimited = false;
    resetOfflineTaskRenderLimit();
    scheduleTaskNotifications();
  } catch (error) {
    if (!isCurrent()) return;
    if (isOfflineCapableError(error)) {
      await hydrateCachedTasks({ viewContext, requestSequence, sessionContext });
      if (!isCurrent()) return;
      setStatus(nodes.taskMessage, t("task.offlineCached"));
      return;
    }
    throw error;
  }
  render();
}

async function fetchTaskListPages(baseParams, sessionContext = captureSessionContext()) {
  const tasks = [];
  let cursorId = null;
  let cursorUpdatedAt = "";

  for (let page = 0; page < MAX_TASK_PAGES; page += 1) {
    if (!isSessionContextCurrent(sessionContext)) return [];
    const params = new URLSearchParams(baseParams);
    if (cursorId !== null && cursorUpdatedAt) {
      params.set("cursor_id", String(cursorId));
      params.set("cursor_updated_at", cursorUpdatedAt);
    }

    const pageTasks = await apiRequest(`/tasks?${params.toString()}`);
    if (!isSessionContextCurrent(sessionContext)) return [];
    tasks.push(...pageTasks);
    if (pageTasks.length < TASK_LIMIT) {
      return tasks;
    }

    const lastTask = pageTasks.at(-1);
    if (!lastTask?.id || !lastTask.updated_at) {
      throw new Error("Task list pagination cursor is missing.");
    }
    cursorId = lastTask.id;
    cursorUpdatedAt = lastTask.updated_at;
  }

  throw new Error("Task list pagination exceeded the safety limit.");
}

async function refreshSyncStatus(options = {}) {
  const sessionContext = options.sessionContext || captureSessionContext();
  if (!isSessionContextCurrent(sessionContext)) return false;
  const requestSequence = connectionRequestGate.begin();
  if (state.offlineMode) {
    state.syncStatus = null;
    renderSyncStatus();
    renderTaskSyncHealthBar();
    updateConnectionBadge();
    if (options.announce) {
      toast(t("sync.nextStepSignIn"));
    }
    return;
  }
  try {
    const syncStatus = await apiRequest("/sync/status", { auth: false });
    if (!isSessionContextCurrent(sessionContext) || !connectionRequestGate.isCurrent(requestSequence)) return false;
    state.syncStatus = syncStatus;
  } catch (error) {
    if (!isSessionContextCurrent(sessionContext) || !connectionRequestGate.isCurrent(requestSequence)) return false;
    if (isOfflineCapableError(error)) {
      state.syncStatus = null;
      renderSyncStatus();
      renderTaskSyncHealthBar();
      updateConnectionBadge();
      if (options.announce) {
        showSyncStatusFeedback(error);
      }
      return false;
    }
    throw error;
  }
  renderSyncStatus();
  renderTaskSyncHealthBar();
  updateConnectionBadge();
  if (options.announce) {
    showSyncStatusFeedback();
  }
  return true;
}

async function login(payload) {
  return apiRequest("/auth/login", { method: "POST", auth: false, body: payload });
}

async function register(payload) {
  return apiRequest("/auth/register", { method: "POST", auth: false, body: payload });
}

async function createTask(payload) {
  return apiRequest("/tasks", { method: "POST", body: payload });
}

async function createTaskWithOfflineFallback(payload) {
  const sessionContext = captureSessionContext();
  const createPayload = withClientRequestId(payload, () => makeClientRequestId("task-create"));
  if (shouldQueueOfflineMutation()) {
    await createTaskOffline(createPayload);
    if (isSessionContextCurrent(sessionContext)) toast(pendingSyncSavedMessage());
    return;
  }
  try {
    await createTask(createPayload);
    if (isSessionContextCurrent(sessionContext)) toast(t("task.created"));
  } catch (error) {
    if (!isSessionContextCurrent(sessionContext)) return;
    if (!isOfflineCapableError(error)) throw error;
    await createTaskOffline(createPayload);
    if (isSessionContextCurrent(sessionContext)) toast(pendingSyncSavedMessage());
  }
}

async function submitQuickTask() {
  if (state.loading) return;
  const sessionContext = captureSessionContext();
  let submittedDraft = null;
  setStatus(nodes.quickTaskMessage, "");
  setBusy(true);
  try {
    persistQuickTaskDraft();
    selectTaskCreateDraft();
    const payload = readQuickTaskPayload();
    persistTaskDraft();
    submittedDraft = currentTaskDraft();
    await createTaskWithOfflineFallback(payload);
    if (!isSessionContextCurrent(sessionContext)) return;
    finishTaskDraftSubmission(submittedDraft);
    await Promise.all([refreshTasks(), refreshMeta()]);
    if (isSessionContextCurrent(sessionContext)) render();
  } catch (error) {
    if (!isSessionContextCurrent(sessionContext)) return;
    if (submittedDraft) reportTaskDraftSubmissionError(submittedDraft, error, { quick: true });
    else setStatus(nodes.quickTaskMessage, normalizeError(error));
  } finally {
    if (isSessionContextCurrent(sessionContext)) setBusy(false);
  }
}

async function updateTask(taskId, payload) {
  return apiRequest(`/tasks/${taskId}`, { method: "PUT", body: payload });
}

async function mutateTask(taskId, action, expectedVersion) {
  if (action === "complete") {
    return apiRequest(withExpectedVersion(`/tasks/${taskId}/complete`, expectedVersion), { method: "POST" });
  }
  if (action === "undo-complete") {
    return apiRequest(withExpectedVersion(`/tasks/${taskId}/undo-complete`, expectedVersion), { method: "POST" });
  }
  if (action === "delete") {
    return apiRequest(withExpectedVersion(`/tasks/${taskId}`, expectedVersion), { method: "DELETE" });
  }
  if (action === "restore") {
    return apiRequest(withExpectedVersion(`/tasks/${taskId}/restore`, expectedVersion), { method: "POST" });
  }
  throw new Error("Unsupported action");
}

async function applyTaskAction(task, action, options = {}) {
  const { confirm = true, showToast = true, refresh = true } = options;
  const id = Number(task.id);
  if (!Number.isFinite(id)) {
    throw new Error("Task is not available in the offline cache");
  }
  if (confirm && !(await confirmTaskAction(task, action))) {
    return false;
  }
  if (shouldQueueOfflineMutation()) {
    await mutateTaskOffline(task, action);
    if (showToast) {
      toast(pendingSyncSavedMessage());
    }
    if (state.editingTaskId === id && (action === "delete" || action === "restore")) {
      resetAndCloseTaskEditor();
    }
    render();
    return true;
  }
  try {
    await mutateTask(id, action, task.version);
  } catch (error) {
    if (!isConflictError(error) && isOfflineCapableError(error)) {
      await mutateTaskOffline(task, action);
      if (showToast) {
        toast(pendingSyncSavedMessage());
      }
      if (state.editingTaskId === id && (action === "delete" || action === "restore")) {
        resetAndCloseTaskEditor();
      }
      render();
      return true;
    }
    throw error;
  }
  if (showToast) {
    toast(action === "restore" ? t("task.restored") : t("task.updated"));
  }
  if (state.editingTaskId === id && (action === "delete" || action === "restore")) {
    resetAndCloseTaskEditor();
  }
  if (refresh) {
    await refreshTasks();
    await refreshMeta();
  }
  return true;
}

async function applyTaskScheduleAction(task, action) {
  const patch = {
    ...buildTaskSchedulePatch(action, new Date(), { timeZone: DISPLAY_TIME_ZONE }),
    expected_version: task.version,
  };
  if (shouldQueueOfflineMutation()) {
    await updateTaskOffline(task.id, patch);
    toast(pendingSyncSavedMessage());
    render();
    return;
  }
  try {
    await updateTask(task.id, patch);
    toast(t("task.updated"));
  } catch (error) {
    if (!isOfflineCapableError(error)) throw error;
    await updateTaskOffline(task.id, patch);
    toast(pendingSyncSavedMessage());
    render();
    return;
  }
  await Promise.all([refreshTasks(), refreshMeta()]);
  render();
}

async function instantiateTemplateTask(task) {
  setBusy(true);
  try {
    if (shouldQueueOfflineMutation()) {
      await instantiateTemplateTaskOffline(task);
      toast(pendingSyncSavedMessage());
      render();
      return;
    }
    try {
      await apiRequest(`/tasks/templates/${task.id}/instantiate`, { method: "POST" });
      toast(t("task.createdFromTemplate"));
      await Promise.all([refreshTasks(), refreshMeta()]);
    } catch (error) {
      if (isOfflineCapableError(error)) {
        await instantiateTemplateTaskOffline(task);
        toast(pendingSyncSavedMessage());
        render();
        return;
      }
      throw error;
    }
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function resolveTaskConflict(taskId, strategy, taskPayload = null) {
  const body = taskPayload ? { strategy, task: taskPayload } : { strategy };
  return apiRequest(`/tasks/${taskId}/resolve-conflict`, { method: "POST", body });
}

async function useCloudConflictTask(task) {
  if (!canResolveTaskConflict(task)) {
    toast(t("sync.useServerUnavailable"));
    return;
  }
  if (
    !(await confirmUserAction({
      title: t("sync.useServerTitle"),
      message: formatMessage("sync.useServerMessage", { title: task.title }),
      confirmText: t("sync.useServerConfirm"),
    }))
  ) {
    return;
  }
  setBusy(true);
  try {
    const remoteTask = await resolveTaskConflict(task.id, "use_server");
    await putCachedTask(normalizeRemoteTaskForOffline(remoteTask));
    await deleteOfflineMutationsForTask(task.id);
    toast(t("sync.useServerDone"));
    await Promise.allSettled([refreshOfflineQueueCount(), refreshTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function overwriteCloudConflictTask(task) {
  if (!canResolveTaskConflict(task)) {
    toast(t("sync.overwriteServerUnavailable"));
    return;
  }
  if (
    !(await confirmUserAction({
      title: t("sync.overwriteServerTitle"),
      message: formatMessage("sync.overwriteServerMessage", { title: task.title }),
      confirmText: t("sync.overwriteServerConfirm"),
      danger: true,
    }))
  ) {
    return;
  }
  setBusy(true);
  try {
    const remoteTask = await resolveTaskConflict(task.id, "overwrite_server", buildConflictOverwritePayload(task));
    await putCachedTask(normalizeRemoteTaskForOffline(remoteTask));
    await deleteOfflineMutationsForTask(task.id);
    toast(t("sync.overwriteServerDone"));
    await Promise.allSettled([refreshOfflineQueueCount(), refreshTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function retryFailedTaskSync(task) {
  if (!hasSession() || !navigator.onLine) {
    toast(t("sync.nextStepSignIn"));
    return;
  }
  const records = (await listOfflineQueue()).filter(
    (record) => Number(record.task_id) === Number(task.id),
  );
  if (!records.some((record) => record.offline_status === "sync_failed")) {
    toast(t("sync.noFailedMutation"));
    return;
  }

  setBusy(true);
  try {
    setStatus(nodes.taskMessage, t("sync.retrying"));
    for (const record of records) {
      await updateOfflineMutation(record, {
        offline_status: "pending",
        offline_error: null,
      });
    }
    const firstRecord = records[0];
    await putCachedTask({
      ...task,
      offline_status: pendingTaskStatusForMutation(firstRecord),
      offline_queue_id: firstRecord.offline_queue_id,
      offline_error: null,
      conflictLocalJson: null,
      conflictServerJson: null,
      conflict_local_json: null,
      conflict_server_json: null,
      offline_conflict_local_json: null,
      offline_conflict_server_json: null,
    });
    await flushOfflineQueue();
    const remaining = (await listOfflineQueue()).filter(
      (record) => Number(record.task_id) === Number(task.id),
    );
    const message = remaining.some((record) => record.offline_status === "sync_failed")
      ? t("sync.failedMessage")
      : t("sync.retryDone");
    toast(message);
    await Promise.allSettled([hydrateCachedTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

function pendingTaskStatusForMutation(record) {
  if (record?.action === "create") return "pending:create";
  if (record?.action === "update") return "pending:update";
  if (record?.action === "mutate") return `pending:${record.task_action || "change"}`;
  return "pending:change";
}

async function discardFailedTaskSync(task) {
  const records = (await listOfflineQueue()).filter(
    (record) => Number(record.task_id) === Number(task.id),
  );
  if (!records.length) {
    toast(t("sync.noFailedMutation"));
    return;
  }
  const localOnly = isLocalOnlyTask(task) || records.some((record) => record.action === "create");
  if (!localOnly && (!hasSession() || !navigator.onLine)) {
    toast(t("sync.discardNeedsConnection"));
    return;
  }
  const confirmed = await confirmUserAction({
    title: t("sync.discardTitle"),
    message: formatMessage("sync.discardMessage", { title: task.title || t("task.untitled") }),
    confirmText: t("sync.discardConfirm"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  try {
    let remoteTask = null;
    if (!localOnly) {
      try {
        remoteTask = await apiRequest(`/tasks/${encodeURIComponent(String(task.id))}`);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
      }
    }
    await deleteOfflineMutationsForTask(task.id);
    if (localOnly || !remoteTask) {
      await deleteCachedTask(task.id);
    } else {
      await putCachedTask(normalizeRemoteTaskForOffline(remoteTask));
    }
    toast(t("sync.discarded"));
    await Promise.allSettled([hydrateCachedTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function purgeTask(task) {
  const title = task?.title ? `「${task.title}」` : t("task.thisTask");
  const confirmed = await confirmUserAction({
    title: t("confirm.purgeTaskTitle"),
    message: formatMessage("confirm.purgeTaskMessage", { title }),
    confirmText: t("task.purge"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  try {
    await purgeTaskAfterConfirmation(task);
    toast(t("task.purged"));
    await Promise.allSettled([refreshTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function purgeTaskAfterConfirmation(task) {
  const taskId = Number(task.id);
  if (!Number.isFinite(taskId)) {
    throw new Error("Task is not available in the offline cache");
  }
  if (isLocalOnlyTask(task)) {
    await deleteOfflineMutationsForTask(task.id);
    await deleteCachedTask(task.id);
    await hydrateCachedTasks();
    return;
  }
  if (!navigator.onLine) {
    throw new ValidationError("task.purgeRequiresConnection");
  }
  if (task.offline_status) {
    await flushOfflineQueue();
  }
  await purgeTaskFromServer(taskId);
  await deleteOfflineMutationsForTask(taskId);
  await deleteCachedTask(taskId);
  if (state.editingTaskId === taskId) {
    resetAndCloseTaskEditor();
  }
}

async function restoreSelectedTrashTasks() {
  const selected = selectedTrashTasks();
  if (!selected.length) return;

  setBusy(true);
  try {
    for (const task of selected) {
      await applyTaskAction(task, "restore", { confirm: false, showToast: false, refresh: false });
    }
    clearSelectedTrashTasks();
    toast(t("task.selectedRestored"));
    await Promise.allSettled([refreshTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function purgeSelectedTrashTasks() {
  const selected = selectedTrashTasks();
  if (!selected.length) return;
  const confirmed = await confirmUserAction({
    title: t("confirm.purgeSelectedTitle"),
    message: formatMessage("confirm.purgeSelectedMessage", { count: selected.length }),
    confirmText: t("task.purgeSelectedTrash"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  try {
    for (const task of selected) {
      await purgeTaskAfterConfirmation(task);
    }
    clearSelectedTrashTasks();
    toast(t("task.selectedPurged"));
    await Promise.allSettled([refreshTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function completeSelectedTasks() {
  const selected = selectedTasks();
  if (!selected.length) return;

  setBusy(true);
  try {
    for (const task of selected) {
      await applyTaskAction(task, "complete", { confirm: false, showToast: false, refresh: false });
    }
    exitTaskSelectionMode();
    toast(t("task.selectedCompleted"));
    await Promise.allSettled([refreshTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

async function deleteSelectedTasks() {
  const selected = selectedTasks();
  if (!selected.length) return;
  const confirmed = await confirmUserAction({
    title: t("confirm.deleteSelectedTitle"),
    message: formatMessage("confirm.deleteSelectedMessage", { count: selected.length }),
    confirmText: t("task.deleteSelected"),
    danger: true,
  });
  if (!confirmed) return;

  setBusy(true);
  try {
    for (const task of selected) {
      await applyTaskAction(task, "delete", { confirm: false, showToast: false, refresh: false });
    }
    exitTaskSelectionMode();
    toast(t("task.selectedDeleted"));
    await Promise.allSettled([refreshTasks(), refreshMeta()]);
  } catch (error) {
    toast(normalizeError(error));
  } finally {
    setBusy(false);
  }
}

function isLocalOnlyTask(task) {
  const taskId = Number(task?.id);
  return !Number.isFinite(taskId) || taskId <= 0 || task?.offline_status === "pending:create";
}

async function purgeTaskFromServer(taskId) {
  return apiRequest(`/tasks/${taskId}/purge`, { method: "DELETE" });
}

async function apiRequest(path, options = {}) {
  const sessionContext = captureSessionContext();
  const {
    method = "GET",
    body,
    auth = true,
    retryAuth = true,
    authRefreshAttempted = false,
  } = options;
  if (isMixedContentApiUrl(location.protocol, state.apiBaseUrl)) {
    throw new ValidationError("validation.mixedContentApi");
  }
  const headers = {
    "Content-Type": "application/json",
    "X-Request-ID": makeClientRequestId(path),
  };
  if (auth && state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }
  const response = await fetch(toApiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: getApiRequestCredentialsMode(state.apiBaseUrl, location.origin),
  });
  const payload = await readPayload(response);
  if (response.status === 401 && auth && retryAuth && !path.startsWith("/auth/refresh") && isSessionContextCurrent(sessionContext)) {
    if (state.refreshToken && !authRefreshAttempted) {
      try {
        await refreshSessionSingleflight();
      } catch (error) {
        if (isSessionContextCurrent(sessionContext) && error instanceof ApiError && isTerminalRefreshStatus(error.status)) {
          enterReauthenticationState();
        }
        throw error;
      }
      if (!isSessionContextCurrent(sessionContext)) {
        throw new ApiError("Session changed while refreshing authentication", 401);
      }
      return apiRequest(path, {
        method,
        body,
        auth,
        retryAuth,
        authRefreshAttempted: true,
      });
    }
    enterReauthenticationState();
  }
  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload) || `HTTP ${response.status}`, response.status, payload);
  }
  return unwrapPayload(payload);
}

async function refreshSession(expectedRefreshToken, expectedGeneration) {
  const expectedUserId = state.user?.id ?? null;
  const credentialsMode = getApiRequestCredentialsMode(state.apiBaseUrl, location.origin);
  const body = buildRefreshRequestBody(
    credentialsMode,
    expectedRefreshToken,
    state.deviceId,
  );
  const data = await apiRequest("/auth/refresh", {
    method: "POST",
    auth: false,
    body,
  });
  if (!canApplySessionRefreshResult({
    expectedGeneration,
    currentGeneration: sessionRefreshGeneration,
    expectedRefreshToken,
    currentRefreshToken: state.refreshToken,
    sessionAllowed: shouldRestorePersistentSession(),
    expectedUserId,
    currentUserId: state.user?.id ?? null,
    resultUserId: data.user?.id ?? null,
  })) {
    return false;
  }
  persistTokens(data);
  return true;
}

async function restorePersistentSession() {
  const sessionContext = captureSessionContext();
  const expectedRefreshToken = state.refreshToken;
  const expectedGeneration = sessionRefreshGeneration;
  const expectedUserId = state.user?.id ?? null;
  try {
    await coordinateSessionRefresh(expectedRefreshToken, async () => {
      if (hasSession()) return;
      const credentialsMode = getApiRequestCredentialsMode(state.apiBaseUrl, location.origin);
      if (credentialsMode === "omit" && !expectedRefreshToken) return false;
      const data = await apiRequest("/auth/refresh", {
        method: "POST",
        auth: false,
        retryAuth: false,
        body: buildRefreshRequestBody(credentialsMode, expectedRefreshToken, state.deviceId),
      });
      if (!canApplySessionRefreshResult({
        expectedGeneration,
        currentGeneration: sessionRefreshGeneration,
        expectedRefreshToken,
        currentRefreshToken: state.refreshToken,
        sessionAllowed: shouldRestorePersistentSession(),
        expectedUserId,
        currentUserId: state.user?.id ?? null,
        resultUserId: data.user?.id ?? null,
      })) {
        return false;
      }
      persistTokens(data);
      return true;
    }, expectedGeneration);
    if (!isSessionContextCurrent(sessionContext) || !hasSession()) return;
    await prepareOfflineProfileStorage().catch(() => {});
    await activateSessionSingleflight(sessionContext);
  } catch (error) {
    if (!isSessionContextCurrent(sessionContext)) return;
    if (error instanceof ApiError && isTerminalRefreshStatus(error.status)) {
      suppressPersistentSession(expectedUserId);
    }
  }
}

async function refreshSessionSingleflight() {
  if (!refreshSessionPromise) {
    const expectedRefreshToken = state.refreshToken;
    const expectedGeneration = sessionRefreshGeneration;
    const request = coordinateSessionRefresh(
      expectedRefreshToken,
      () => refreshSession(expectedRefreshToken, expectedGeneration),
      expectedGeneration,
    );
    refreshSessionPromise = request;
    void request.then(
      () => clearCompletedSessionRefresh(request),
      () => clearCompletedSessionRefresh(request),
    );
  }
  return refreshSessionPromise;
}

function clearCompletedSessionRefresh(request) {
  if (refreshSessionPromise === request) {
    refreshSessionPromise = null;
  }
}

function invalidateSessionRefreshes() {
  sessionRefreshGeneration += 1;
  refreshSessionPromise = null;
  sessionActivationPromise = null;
  sessionActivationContext = null;
  offlineQueueFlushPromise = null;
  offlineQueueFlushContext = null;
  if (state.loading) setBusy(false);
}

async function coordinateSessionRefresh(
  expectedRefreshToken,
  refreshAction,
  expectedGeneration = sessionRefreshGeneration,
) {
  const withLock = navigator.locks && typeof navigator.locks.request === "function"
    ? (callback) => navigator.locks.request(sessionRefreshLockName(), callback)
    : (callback) => withSessionRefreshLease(callback);
  return coordinateRefreshSession({
    expectedRefreshToken,
    getCurrentRefreshToken: () => state.refreshToken,
    refresh: () => (
      sessionRefreshGeneration === expectedGeneration
        ? refreshAction()
        : false
    ),
    withLock,
    yieldTurn: () => new Promise((resolve) => window.setTimeout(resolve, 0)),
  });
}

function withSessionRefreshLease(callback) {
  const lockName = sessionRefreshLockName();
  const owner = `${sessionCoordinatorId}.${crypto.randomUUID()}`;
  return withRefreshLease({
    lockName,
    owner,
    readLease: readSessionRefreshLease,
    writeLease: writeSessionRefreshLease,
    clearLease: clearSessionRefreshLease,
    callback,
    wait: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
  });
}

function readSessionRefreshLease() {
  const raw = readStoredString(SESSION_REFRESH_LEASE_STORAGE_KEY, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    removeStoredString(SESSION_REFRESH_LEASE_STORAGE_KEY);
    return null;
  }
}

function writeSessionRefreshLease(lease) {
  writeStoredString(SESSION_REFRESH_LEASE_STORAGE_KEY, JSON.stringify(lease));
}

function clearSessionRefreshLease() {
  removeStoredString(SESSION_REFRESH_LEASE_STORAGE_KEY);
}

function sessionRefreshLockName() {
  return `${SESSION_REFRESH_LOCK_NAME}.${encodeURIComponent(state.apiBaseUrl)}.${state.deviceId}`;
}

async function reportClientError(errorLike) {
  if (!state.clientErrorReportingEnabled) return;
  if (!state.accessToken) {
    return;
  }
  const details = normalizeClientError(errorLike);
  if (!details.message) {
    return;
  }
  try {
    await apiRequest("/observability/client-error", {
      method: "POST",
      body: {
        source: "web",
        message: details.message,
        stack: details.stack,
        url: sanitizeClientErrorUrl(location.href),
        user_agent: navigator.userAgent.slice(0, 255),
        app_version: WEB_APP_VERSION,
        route: location.pathname,
        trace_id: makeClientRequestId("client-error"),
        visibility_state: document.visibilityState,
        online: navigator.onLine,
      },
    });
  } catch {
    // Error reporting is best-effort; never break the foreground workflow.
  }
}

function normalizeClientError(errorLike) {
  if (errorLike instanceof Error) {
    return {
      message: errorLike.message.slice(0, 500),
      stack: sanitizeClientErrorStack(errorLike.stack),
    };
  }
  const message = String(errorLike || "").trim();
  return {
    message: message.slice(0, 500),
    stack: null,
  };
}

function sanitizeClientErrorUrl(value) {
  try {
    const url = new URL(value, location.href);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return `${location.origin}${location.pathname}`;
  }
}

function sanitizeClientErrorStack(stack) {
  if (!stack) {
    return null;
  }
  return String(stack)
    .replace(/([?&](?:access|refresh)_?token=)[^&\s)]+/gi, "$1[removed]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[removed]")
    .slice(0, 4000);
}

function readAuthPayload() {
  writeStoredString("deviceId", state.deviceId);
  if (state.authMode === "login") {
    const payload = {
      username_or_email: nodes.usernameOrEmail.value.trim(),
      password: nodes.password.value,
      device_id: state.deviceId,
    };
    validateAuthPayload(payload);
    return payload;
  }
  const payload = {
    username: nodes.username.value.trim(),
    email: nodes.email.value.trim(),
    password: nodes.password.value,
    device_id: state.deviceId,
  };
  validateAuthPayload(payload);
  return payload;
}

function validateAuthPayload(payload) {
  if ("username_or_email" in payload && !payload.username_or_email) {
    throw new ValidationError("validation.accountRequired");
  }
  if ("username" in payload && !payload.username) {
    throw new ValidationError("validation.usernameRequired");
  }
  if ("email" in payload && !payload.email) {
    throw new ValidationError("validation.emailRequired");
  }
  if (!payload.password) {
    throw new ValidationError("validation.passwordRequired");
  }
  if ("username" in payload && payload.password.length < 8) {
    throw new ValidationError("validation.passwordMinLength");
  }
}

function readTaskPayload() {
  const editing = state.editingTaskId !== null;
  const quickTask = editing ? null : parseWebQuickTask(nodes.taskTitle.value);
  const explicitProject = normalizeNullable(nodes.taskProject.value);
  const explicitTag = normalizeNullable(nodes.taskTag.value);
  const explicitPriority = Number(nodes.taskPriority.value || 0);
  const explicitPlannedDate = nodes.taskPlannedDate.value || null;
  const explicitDueTime = nodes.taskDueTime.value ? new Date(nodes.taskDueTime.value).toISOString() : null;
  const explicitRemindTime = nodes.taskRemindTime.value ? new Date(nodes.taskRemindTime.value).toISOString() : null;
  const explicitRepeatRule = nodes.taskRepeatRule.value || null;
  const existingChecklist = state.checklistDraftItems.length ? state.checklistDraftItems : getEditingTask()?.checklist || [];
  const payload = {
    title: editing ? nodes.taskTitle.value.trim() : quickTask.title,
    content: normalizeNullable(nodes.taskContent.value),
    project: editing ? explicitProject : (explicitProject ?? quickTask.project),
    tag: editing ? explicitTag : (explicitTag ?? quickTask.tag),
    priority: editing ? explicitPriority : (explicitPriority || quickTask.priority),
    list_type: !editing && quickTask.planned_date && explicitPlannedDate === getTaskCreatePresetForCurrentView().plannedDate
      ? "inbox" : nodes.taskListType.value,
    planned_date: editing ? explicitPlannedDate
      : (quickTask.planned_date && explicitPlannedDate === getTaskCreatePresetForCurrentView().plannedDate
        ? quickTask.planned_date : (explicitPlannedDate ?? quickTask.planned_date)),
    due_time: editing ? explicitDueTime : (explicitDueTime ?? quickTask.due_time),
    remind_time: explicitRemindTime,
    repeat_rule: explicitRepeatRule,
    checklist: parseChecklistInput(nodes.taskChecklist.value, existingChecklist),
    is_template: nodes.taskIsTemplate.checked,
    template_name: nodes.taskIsTemplate.checked ? normalizeNullable(nodes.taskTemplateName.value) : null,
  };
  if (!payload.title) {
    throw new ValidationError("validation.taskTitleRequired");
  }
  if (!editing) {
    taskCreateRequestId ||= makeClientRequestId("task-create");
    payload.client_request_id = taskCreateRequestId;
  }
  return payload;
}

function readQuickTaskPayload() {
  return readTaskPayload();
}

function parseChecklistInput(value, existingChecklist = []) {
  const existing = Array.isArray(existingChecklist) ? existingChecklist : [];
  const usedIndexes = new Set();
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((title, index) => {
      const previous = preserveChecklistItem(title, index, existing, usedIndexes);
      return {
        id: previous?.id ? String(previous.id) : crypto.randomUUID(),
        title,
        done: previous ? Boolean(previous.done) : false,
      };
    });
}

function preserveChecklistItem(title, index, existing, usedIndexes) {
  const direct = existing[index];
  if (direct && !usedIndexes.has(index) && String(direct.title || "").trim() === title) {
    usedIndexes.add(index);
    return direct;
  }
  const matchingIndex = existing.findIndex((item, itemIndex) =>
    !usedIndexes.has(itemIndex) && String(item?.title || "").trim() === title,
  );
  if (matchingIndex >= 0) {
    usedIndexes.add(matchingIndex);
    return existing[matchingIndex];
  }
  return null;
}

function formatChecklistInput(checklist) {
  if (!Array.isArray(checklist)) return "";
  return checklist
    .map((item) => String(item?.title || "").trim())
    .filter(Boolean)
    .join("\n");
}

function renderTaskChecklistItems() {
  if (!nodes.taskChecklistItems) return;
  nodes.taskChecklistItems.replaceChildren();
  const items = Array.isArray(state.checklistDraftItems) ? state.checklistDraftItems : [];
  if (!items.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement("label");
    row.className = "checklist-draft-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(item.done);
    checkbox.dataset.checklistAction = "toggle";
    checkbox.dataset.checklistItemId = item.id;

    const title = document.createElement("span");
    title.textContent = item.title;
    if (item.done) {
      title.classList.add("done");
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "text-button";
    deleteButton.dataset.checklistAction = "delete";
    deleteButton.dataset.checklistItemId = item.id;
    deleteButton.textContent = t("checklist.delete");

    row.append(checkbox, title, deleteButton);
    fragment.append(row);
  }
  nodes.taskChecklistItems.append(fragment);
}

function syncChecklistTextareaFromDraftItems() {
  nodes.taskChecklist.value = formatChecklistInput(state.checklistDraftItems);
  persistTaskDraft();
  renderTaskChecklistItems();
}

function toggleChecklistDraftItem(itemId) {
  state.checklistDraftItems = state.checklistDraftItems.map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item,
  );
  syncChecklistTextareaFromDraftItems();
}

function deleteChecklistDraftItem(itemId) {
  state.checklistDraftItems = state.checklistDraftItems.filter((item) => item.id !== itemId);
  syncChecklistTextareaFromDraftItems();
}

function parseWebQuickTask(value) {
  const quick = {
    title: String(value || "").trim(),
    project: null,
    tag: null,
    priority: 0,
    planned_date: null,
    due_time: null,
  };
  let title = quick.title;
  title = title.replace(/(^|\s)#([^\s#@]+)/g, (_, prefix, tag) => {
    quick.tag ||= tag.trim();
    return prefix;
  });
  title = title.replace(/(^|\s)@([^\s#@]+)/g, (_, prefix, project) => {
    quick.project ||= project.trim();
    return prefix;
  });
  title = title.replace(/(^|\s)[Pp]([1-5])\b/g, (_, prefix, priority) => {
    quick.priority ||= Number(priority);
    return prefix;
  });
  const timed = parseWebQuickDate(title);
  title = timed.title;
  quick.planned_date = timed.planned_date;
  quick.due_time = timed.due_time;
  quick.title = title.replace(/\s+/g, " ").trim();
  return quick;
}

function parseWebQuickDate(value) {
  const text = String(value || "");
  const match = text.match(
    /(^|\s)(今天|今日|明天|后天|today|tomorrow)(?:\s*(上午|下午|晚上|早上)?\s*(\d{1,2})(?::(\d{2}))?\s*(点|am|pm)?)?/i,
  );
  if (!match) {
    return {
      title: text,
      planned_date: null,
      due_time: null,
    };
  }

  const date = new Date();
  const keyword = match[2].toLowerCase();
  if (keyword === "明天" || keyword === "tomorrow") {
    date.setDate(date.getDate() + 1);
  } else if (keyword === "后天") {
    date.setDate(date.getDate() + 2);
  }

  const plannedDate = toDateInputValue(date);
  const hourValue = match[4] ? Number(match[4]) : null;
  let dueTime = null;
  if (Number.isFinite(hourValue)) {
    let hour = hourValue;
    const meridiem = (match[3] || match[6] || "").toLowerCase();
    if ((meridiem === "下午" || meridiem === "晚上" || meridiem === "pm") && hour < 12) {
      hour += 12;
    }
    if ((meridiem === "早上" || meridiem === "上午" || meridiem === "am") && hour === 12) {
      hour = 0;
    }
    date.setHours(hour, Number(match[5] || 0), 0, 0);
    dueTime = date.toISOString();
  }

  return {
    title: text.replace(match[0], match[1] || " "),
    planned_date: plannedDate,
    due_time: dueTime,
  };
}

function renderTaskQuickPreview() {
  if (!nodes.taskQuickPreview) return;
  if (state.editingTaskId !== null) {
    nodes.taskQuickPreview.replaceChildren();
    nodes.taskQuickPreview.hidden = true;
    return;
  }
  const quickTask = parseWebQuickTask(nodes.taskTitle.value);
  const labels = [];
  if (quickTask.project) labels.push(formatMessage("task.projectPreview", { value: quickTask.project }));
  if (quickTask.tag) labels.push(formatMessage("task.tagPreview", { value: quickTask.tag }));
  if (quickTask.priority) labels.push(getLocalizedPriorityLabel(quickTask.priority));
  if (quickTask.planned_date) labels.push(formatMessage("task.planPreview", { value: quickTask.planned_date }));
  if (quickTask.due_time) labels.push(formatMessage("task.duePreview", { value: formatDisplayDateTime(quickTask.due_time) }));
  nodes.taskQuickPreview.replaceChildren(...labels.map(makeChip));
  nodes.taskQuickPreview.hidden = labels.length === 0;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateInputValue() {
  return toDateInputValue(new Date());
}

function getTaskCreatePresetForCurrentView() {
  if (state.view === "today") {
    return {
      listType: "today",
      plannedDate: getTodayDateInputValue(),
    };
  }
  return {
    listType: "inbox",
    plannedDate: "",
  };
}

function applyTaskCreatePresetForCurrentView() {
  if (state.editingTaskId !== null) {
    return;
  }
  if (state.view === "today") {
    nodes.taskListType.value = "today";
    nodes.taskPlannedDate.value = getTodayDateInputValue();
  } else {
    const preset = getTaskCreatePresetForCurrentView();
    nodes.taskListType.value = preset.listType;
    nodes.taskPlannedDate.value = preset.plannedDate;
  }
  renderTaskQuickPreview();
}

function readTaskPayloadLegacy() {
  return {
    title: nodes.taskTitle.value.trim(),
    content: normalizeNullable(nodes.taskContent.value),
    project: normalizeNullable(nodes.taskProject.value),
    tag: normalizeNullable(nodes.taskTag.value),
    priority: Number(nodes.taskPriority.value || 0),
    list_type: nodes.taskListType.value,
    planned_date: nodes.taskPlannedDate.value || null,
    due_time: nodes.taskDueTime.value ? new Date(nodes.taskDueTime.value).toISOString() : null,
  };
}

function openSettingsSupportPanel() {
  if (!nodes.settingsSupportBackdrop || !nodes.settingsSupportPanel) return;
  if (nodes.settingsSupportPanel.hidden) {
    settingsSupportReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  nodes.settingsSupportBackdrop.hidden = false;
  nodes.settingsSupportPanel.hidden = false;
  nodes.settingsSupportButton?.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => nodes.settingsSupportPanel?.focus());
}

function closeSettingsSupportPanel({ restoreFocus = true } = {}) {
  if (!nodes.settingsSupportBackdrop || !nodes.settingsSupportPanel || nodes.settingsSupportPanel.hidden) return;
  nodes.settingsSupportPanel.hidden = true;
  nodes.settingsSupportBackdrop.hidden = true;
  nodes.settingsSupportButton?.setAttribute("aria-expanded", "false");
  const returnFocus = settingsSupportReturnFocus;
  settingsSupportReturnFocus = null;
  if (!restoreFocus) return;
  window.requestAnimationFrame(() => {
    if (returnFocus?.isConnected) {
      returnFocus.focus();
    } else {
      nodes.settingsSupportButton?.focus();
    }
  });
}

function trapSettingsSupportFocus(event) {
  const focusable = [...nodes.settingsSupportPanel.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
  )].filter((element) => (
    element.getClientRects().length > 0 && !element.closest("details:not([open]) > :not(summary)")
  ));
  if (!focusable.length) {
    event.preventDefault();
    nodes.settingsSupportPanel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (document.activeElement === nodes.settingsSupportPanel || !nodes.settingsSupportPanel.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openSyncSupportPanel() {
  openSettingsSupportPanel();
  if (nodes.supportDataTools) {
    nodes.supportDataTools.open = true;
    nodes.supportDataTools.classList.add("is-focused");
    window.setTimeout(() => {
      nodes.supportDataTools?.classList.remove("is-focused");
    }, 1600);
    nodes.supportDataTools.scrollIntoView({ block: "nearest" });
  }
  if (nodes.syncAdvancedDiagnostics) {
    nodes.syncAdvancedDiagnostics.scrollIntoView({ block: "nearest" });
  }
}

function openTaskCreatePanel({ focusTitle = false, scroll = false } = {}) {
  selectTaskCreateDraft();
  showTaskEditor({ focusTitle });
}

function selectTaskCreateDraft() {
  persistTaskDraft();
  const draft = readTaskDraft(null);
  resetAccountScopedTaskForm();
  if (draft) applyTaskDraftToForm(draft);
  persistTaskDraft();
}

function showTaskEditor({ focusTitle = false } = {}) {
  if (!state.editorOpen) {
    taskEditorReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  state.editorOpen = true;
  renderTaskEditorState();
  if (focusTitle) {
    window.requestAnimationFrame(() => nodes.taskTitle.focus());
  }
}

function beginTaskEdit(task) {
  persistTaskDraft();
  const draft = readTaskDraft(task.id);
  state.editingTaskId = task.id;
  state.editingTaskVersion = task.version;
  taskDraftFormKey = taskDraftSessionKey();
  taskDraftSaveError = "";
  if (draft) applyTaskDraftToForm(draft);
  else populateTaskForm(task);
  persistTaskDraft();
  showTaskEditor({ focusTitle: true });
}

function taskDraftInputSignature(draft) {
  if (!draft) return "";
  return JSON.stringify(Object.keys(draft)
    .filter((key) => key !== "client_request_id" && key !== "save_error")
    .sort()
    .map((key) => [key, draft[key]]));
}

function matchesTaskDraftSubmission(draft, submittedDraft) {
  return Boolean(draft && submittedDraft) &&
    taskDraftInputSignature(draft) === taskDraftInputSignature(submittedDraft) &&
    (draft.client_request_id || "") === (submittedDraft.client_request_id || "");
}

function finishTaskDraftSubmission(submittedDraft) {
  const taskId = submittedDraft.editingTaskId;
  if (!matchesTaskDraftSubmission(readTaskDraft(taskId), submittedDraft)) return;
  if (state.editingTaskId === taskId) {
    if (matchesTaskDraftSubmission(currentTaskDraft(), submittedDraft)) resetAndCloseTaskEditor();
    return;
  }
  clearTaskDraft({ taskId });
  if (taskId === null && nodes.quickTaskTitle.value === submittedDraft.title) {
    nodes.quickTaskTitle.value = "";
    setStatus(nodes.quickTaskMessage, "");
  }
}

function reportTaskDraftSubmissionError(submittedDraft, error, { quick = false } = {}) {
  const taskId = submittedDraft.editingTaskId;
  const message = isConflictError(error)
    ? formatMessage("task.refreshBeforeSaving", { message: normalizeError(error) })
    : normalizeError(error);
  const draft = readTaskDraft(taskId);
  if (matchesTaskDraftSubmission(draft, submittedDraft)) {
    saveTaskDraft({ ...draft, save_error: message }, { activate: false });
  }
  const currentTarget = state.editingTaskId === taskId &&
    matchesTaskDraftSubmission(currentTaskDraft(), submittedDraft);
  if (currentTarget) {
    taskDraftSaveError = message;
    setStatus(nodes.taskMessage, message);
  }
  if (quick && nodes.quickTaskTitle.value === submittedDraft.title) {
    setStatus(nodes.quickTaskMessage, message);
  }
  if (!currentTarget || !state.editorOpen) {
    toast(formatMessage("task.saveFailedFor", { title: submittedDraft.title || t("task.untitled"), message }));
  }
}

function resetTaskForm() {
  clearTaskDraft();
  const createDraft = readTaskDraft(null);
  resetAccountScopedTaskForm();
  if (createDraft) applyTaskDraftToForm(createDraft);
}

function resetAndCloseTaskEditor() {
  resetTaskForm();
  closeTaskEditor({ persistDraft: false });
}

function resetAccountScopedTaskForm() {
  taskDraftFormKey = taskDraftSessionKey();
  taskCreateRequestId = "";
  taskDraftSaveError = "";
  if (nodes.quickTaskTitle) nodes.quickTaskTitle.value = "";
  state.editingTaskId = null;
  state.editingTaskVersion = null;
  nodes.taskForm.reset();
  nodes.taskBodyFields.open = false;
  nodes.taskArrangementFields.open = false;
  nodes.taskAdvancedFields.open = false;
  nodes.taskPriority.value = "0";
  nodes.taskListType.value = "inbox";
  applyTaskCreatePresetForCurrentView();
  nodes.taskRepeatRule.value = "";
  state.checklistDraftItems = [];
  nodes.taskIsTemplate.checked = false;
  nodes.taskTemplateName.value = "";
  updateTaskTemplateNameVisibility();
  nodes.taskMessage.textContent = "";
  renderTaskQuickPreview();
  renderTaskEditorState();
  renderTaskChecklistItems();
}

function resetCurrentTaskForm() {
  const task = getEditingTask();
  if (!task) {
    resetTaskForm();
    return;
  }
  populateTaskForm(task);
  persistTaskDraft();
  renderTaskEditorState();
}

async function confirmResetCurrentTaskForm() {
  if (state.editingTaskId !== null || !hasTaskDraftInput()) {
    return true;
  }
  return confirmUserAction({
    title: t("confirm.clearDraftTitle"),
    message: confirmResetTaskDraft(),
    confirmText: t("confirm.clear"),
  });
}

function confirmResetTaskDraft() {
  return t("confirm.clearDraft");
}

function hasTaskDraftInput() {
  const preset = getTaskCreatePresetForCurrentView();
  return [
    nodes.taskTitle,
    nodes.taskContent,
    nodes.taskProject,
    nodes.taskTag,
    nodes.taskDueTime,
    nodes.taskRemindTime,
    nodes.taskRepeatRule,
    nodes.taskChecklist,
    nodes.taskTemplateName,
  ].some((node) => node.value.trim()) ||
    nodes.taskPriority.value !== "0" ||
    nodes.taskListType.value !== preset.listType ||
    nodes.taskPlannedDate.value !== preset.plannedDate ||
    nodes.taskIsTemplate.checked;
}

function isTaskDraftInputOnlyCreatePreset() {
  return state.editingTaskId === null && !hasTaskDraftInput();
}

function cancelTaskEdit() {
  if (state.editingTaskId === null) {
    return;
  }
  resetAndCloseTaskEditor();
  toast(t("task.canceledEdit"));
}

function closeTaskEditor({ persistDraft = true } = {}) {
  if (!state.editorOpen) return;
  if (persistDraft) persistTaskDraft();
  state.editorOpen = false;
  renderTaskEditorState();
  const returnFocus = taskEditorReturnFocus;
  taskEditorReturnFocus = null;
  window.requestAnimationFrame(() => {
    if (returnFocus?.isConnected) {
      returnFocus.focus();
    } else {
      nodes.openTaskCreateButton?.focus();
    }
  });
}

function trapTaskEditorFocus(event) {
  const focusable = [...nodes.taskCreateDetails.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) {
    event.preventDefault();
    nodes.taskCreateDetails.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!nodes.taskCreateDetails.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function populateTaskForm(task) {
  nodes.taskTitle.value = task.title || "";
  nodes.taskContent.value = task.content || "";
  nodes.taskProject.value = task.project || "";
  nodes.taskTag.value = task.tag || "";
  nodes.taskPriority.value = String(task.priority ?? 0);
  nodes.taskListType.value = task.list_type || "inbox";
  nodes.taskPlannedDate.value = task.planned_date || "";
  nodes.taskDueTime.value = toDateTimeInputValue(task.due_time);
  nodes.taskRemindTime.value = toDateTimeInputValue(task.remind_time);
  nodes.taskRepeatRule.value = task.repeat_rule || "";
  state.checklistDraftItems = parseChecklistInput(formatChecklistInput(task.checklist), task.checklist);
  nodes.taskChecklist.value = formatChecklistInput(state.checklistDraftItems);
  nodes.taskIsTemplate.checked = Boolean(task.is_template);
  nodes.taskTemplateName.value = task.template_name || "";
  updateTaskTemplateNameVisibility();
  renderTaskQuickPreview();
  renderTaskChecklistItems();
  expandTaskAdvancedFieldsIfNeeded();
}

function updateTaskTemplateNameVisibility() {
  nodes.taskTemplateNameField.hidden = !nodes.taskIsTemplate.checked;
  if (!nodes.taskIsTemplate.checked) {
    nodes.taskTemplateName.value = "";
  }
}

function expandTaskAdvancedFieldsIfNeeded() {
  nodes.taskBodyFields.open = hasTaskBodyValues();
  nodes.taskArrangementFields.open = hasTaskArrangementValues();
  nodes.taskAdvancedFields.open = hasTaskMetadataValues();
}

function hasTaskBodyValues() {
  return Boolean(
    nodes.taskContent.value.trim() ||
      nodes.taskChecklist.value.trim() ||
      state.checklistDraftItems.length > 0,
  );
}

function hasTaskArrangementValues(preset = getTaskCreatePresetForCurrentView()) {
  return Boolean(
    nodes.taskDueTime.value.trim() ||
      nodes.taskRemindTime.value.trim() ||
      nodes.taskPriority.value !== "0" ||
      nodes.taskListType.value !== preset.listType ||
      nodes.taskPlannedDate.value !== preset.plannedDate,
  );
}

function hasTaskMetadataValues() {
  return Boolean(
    nodes.taskProject.value.trim() ||
      nodes.taskTag.value.trim() ||
      nodes.taskRepeatRule.value.trim() ||
      nodes.taskTemplateName.value.trim() ||
      nodes.taskIsTemplate.checked,
  );
}

function renderTaskEditorState() {
  const task = getEditingTask();
  const editing = state.editingTaskId !== null;
  nodes.taskCreateDetails.hidden = !state.editorOpen;
  nodes.taskSubmitButton.textContent = editing ? t("task.saveChanges") : t("task.create");
  nodes.cancelEditButton.hidden = false;
  nodes.cancelEditButton.textContent = t("task.closeEditor");
  nodes.resetTaskFormButton.textContent = editing ? t("task.resetCurrent") : t("task.reset");
  setStatus(
    nodes.taskMessage,
    taskDraftSaveError || (editing ? formatMessage("task.editing", { title: task?.title || `#${state.editingTaskId}` }) : ""),
  );
}

function getEditingTask() {
  if (state.editingTaskId === null) {
    return null;
  }
  return findTaskById(state.editingTaskId);
}

function findTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId) || null;
}

function isLoopbackHost(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function persistTokens(data, { broadcast = true } = {}) {
  if (data.user && state.user && Number(data.user.id) !== Number(state.user.id)) {
    persistTaskDraft();
    resetAccountScopedTaskForm();
    state.editorOpen = false;
    taskEditorReturnFocus = null;
    taskDraftFormKey = "";
  }
  preserveLegacyOfflineProfileOwner();
  writeStoredString("apiBaseUrl", state.apiBaseUrl);
  writeStoredString("deviceId", state.deviceId);
  state.offlineMode = false;
  state.accessToken = data.access_token;
  state.refreshToken = data.refresh_token;
  if (data.user) {
    state.user = data.user;
    writeSessionJson("user", data.user);
    persistOfflineProfile(data.user);
  }
  writeSessionString("accessToken", state.accessToken);
  writeSessionString("refreshToken", state.refreshToken);
  writeSessionString("apiBaseUrl", state.apiBaseUrl);
  removeStoredString("accessToken");
  removeStoredString("refreshToken");
  removeStoredString(PERSISTENT_SESSION_SUPPRESSED_KEY);
  if (broadcast) broadcastSessionTokens(data);
}

function clearAuthenticationInputs() {
  clearAccountScopedInputs([
    nodes.username,
    nodes.email,
    nodes.usernameOrEmail,
    nodes.password,
    nodes.currentPassword,
    nodes.newPassword,
    nodes.confirmNewPassword,
  ]);
  state.passwordVisible = false;
  renderPasswordVisibility();
}

function clearSession({ discardTaskDraft = false } = {}) {
  invalidateSessionRefreshes();
  if (discardTaskDraft) clearTaskDraft({ all: true });
  else persistTaskDraft();
  closeSettingsSupportPanel({ restoreFocus: false });
  closeTaskActionMenu({ restoreFocus: false });
  clearTaskNotificationTimers();
  clearAuthenticationInputs();
  state.editorOpen = false;
  taskEditorReturnFocus = null;
  resetAccountScopedTaskForm();
  taskDraftFormKey = "";
  closeOfflineDb();
  state.offlineMode = false;
  state.accessToken = "";
  state.refreshToken = "";
  state.user = null;
  state.tasks = [];
  state.selectedTaskIds.clear();
  state.selectedTrashTaskIds.clear();
  state.taskSelectionMode = false;
  state.meta = null;
  state.syncStatus = null;
  state.sessions = [];
  state.offlineQueueCount = 0;
  state.offlineLastSyncedAt = "";
  state.notificationScheduledCount = 0;
  state.editingTaskId = null;
  state.editingTaskVersion = null;
  state.authMode = "login";
  removeSessionString("accessToken");
  removeSessionString("refreshToken");
  removeSessionString("apiBaseUrl");
  removeSessionString("user");
  removeStoredString("accessToken");
  removeStoredString("refreshToken");
  updateAuthMode();
}

function enterReauthenticationState() {
  if (state.user) {
    try {
      persistTaskDraft();
      persistOfflineProfile(state.user);
    } catch {
      // Session cleanup must still complete if browser storage is temporarily unavailable.
    }
  }
  if (hasSession() || state.user) {
    clearSession();
    render();
  }
  setStatus(nodes.authMessage, t("error.sessionExpired"));
  nodes.usernameOrEmail?.focus();
}

function hasSession() {
  return Boolean(state.accessToken && state.refreshToken);
}

function shouldRestorePersistentSession(userId = state.user?.id ?? null) {
  return !isPersistentSessionSuppressed(
    readStoredString(PERSISTENT_SESSION_SUPPRESSED_KEY, ""),
    {
      apiBaseUrl: state.apiBaseUrl,
      deviceId: state.deviceId,
      userId,
    },
  );
}

function suppressPersistentSession(userId = state.user?.id ?? null) {
  writeStoredString(
    PERSISTENT_SESSION_SUPPRESSED_KEY,
    buildPersistentSessionSuppressionMarker(state.apiBaseUrl, state.deviceId, userId),
  );
}

function updateConnectionBadge() {
  const badge = getConnectionBadgeState();
  const label = badge.label;
  nodes.connectionBadge.hidden = !shouldShowConnectionBadge(hasLocalWorkspace(), state.syncStatus);
  nodes.connectionBadge.className = `badge ${badge.className}`;
  nodes.connectionBadge.textContent =
    state.offlineQueueCount > 0
      ? `${label} · ${formatMessage("connection.pendingSync", { count: state.offlineQueueCount })}`
      : label;
}

function getConnectionBadgeState() {
  if (state.offlineMode) {
    return {
      label: t("connection.localMode"),
      className: "badge-warning",
    };
  }
  if (!navigator.onLine) {
    return {
      label: hasSession() ? t("connection.offlineAvailable") : t("connection.offlineDisconnected"),
      className: "badge-danger",
    };
  }
  if (state.syncStatus) {
    const ready = state.syncStatus.status === "ready";
    return {
      label: ready ? t("connection.connected") : t("connection.needsCheck"),
      className: ready ? "badge-success" : "badge-warning",
    };
  }
  return {
    label: hasSession() ? t("connection.unchecked") : t("connection.awaitingLogin"),
    className: "badge-neutral",
  };
}

function showSyncStatusFeedback(error = null) {
  const target = hasSession() ? nodes.taskMessage : nodes.authMessage;
  if (state.syncStatus) {
    setStatus(target, getSyncHealthActionText(state.syncStatus.status));
    toast(getSyncHealthLabel(state.syncStatus.status));
    return;
  }
  const message = error
    ? normalizeAuthError(error)
    : t("sync.statusUnavailable");
  setStatus(target, message);
  toast(message);
}

function hasUnsyncedWebWork() {
  return state.offlineQueueCount > 0 || state.tasks.some((task) => task.offline_status || task.offline_error);
}

function logoutPendingWarning() {
  return t("auth.logoutPendingWarning");
}

function setBusy(isBusy) {
  state.loading = isBusy;
  nodes.refreshAllButton.disabled = isBusy;
  nodes.authSubmitButton.disabled = isBusy;
  nodes.taskSubmitButton.disabled = isBusy;
  nodes.resetTaskFormButton.disabled = isBusy;
  nodes.cancelEditButton.disabled = isBusy;
  nodes.taskForm?.querySelectorAll("input, textarea, select").forEach((field) => {
    field.disabled = isBusy;
  });
  setQuickTaskBusy(isBusy);
  if (nodes.exportLocalBackupButton) nodes.exportLocalBackupButton.disabled = isBusy;
  if (nodes.importLocalBackupInput) nodes.importLocalBackupInput.disabled = isBusy;
  renderLocalDataTools();
  renderOfflineResumePanel();
  renderAccountSecurity();
  renderNotificationSettings();
  renderTaskSelectionToolbar();
}

function setQuickTaskBusy(isBusy) {
  if (nodes.quickTaskTitle) nodes.quickTaskTitle.disabled = isBusy;
  nodes.quickTaskForm?.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function displayUser(user) {
  return user.username || user.email || `#${user.id}`;
}

function normalizeNullable(value) {
  const trimmed = value.trim();
  return trimmed || null;
}

function toDateTimeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function getViewCount(view) {
  if (!state.meta?.counts) return 0;
  const counts = state.meta.counts;
  switch (view) {
    case "":
      return counts.open || 0;
    case "today":
      return counts.today || 0;
    case "inbox":
      return counts.inbox || 0;
    case "week":
      return 0;
    case "overdue":
      return counts.overdue || 0;
    case "high":
      return counts.high || 0;
    case "pending":
      return state.offlineQueueCount || counts.pending || 0;
    case "conflict":
      return counts.conflict || 0;
    case "completed":
      return counts.completed || 0;
    case "templates":
      return counts.templates || 0;
    case "trash":
      return counts.trash || 0;
    default:
      return 0;
  }
}

function setStatus(node, message) {
  node.textContent = message || "";
}

function toast(message) {
  nodes.toast.textContent = message;
  nodes.toast.hidden = false;
  window.clearTimeout(nodes.toast._timer);
  nodes.toast._timer = window.setTimeout(() => {
    nodes.toast.hidden = true;
  }, 2400);
}

function pendingSyncSavedMessage() {
  return state.offlineMode ? t("task.savedSignInToSync") : t("task.savedPendingSync");
}

function normalizeError(error) {
  return normalizeUserFacingError(error);
}

function normalizeAuthError(error) {
  if (error instanceof ValidationError) {
    return validationErrorMessage(error);
  }
  const mapped = normalizeUserFacingError(error);
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return t("error.authInvalidCredentials");
    }
    if (error.status === 403) {
      return t("error.authForbidden");
    }
    if (error.status === 404) {
      return t("error.loginServiceNotFound");
    }
    if (error.status >= 500) {
      return t("error.serverUnavailableWithLocalData");
    }
  }
  if (isOfflineCapableError(error)) {
    return t("error.connectionServiceUnavailable");
  }
  const message = mapped;
  return formatMessage("error.authFallback", { message });
}

function normalizeUserFacingError(error) {
  if (error instanceof ValidationError) {
    return validationErrorMessage(error);
  }
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.trim().toLowerCase();
  if (!normalized) return t("error.generic");
  if (normalized.includes("version conflict")) {
    return t("error.versionConflict");
  }
  if (normalized.includes("unsupported repeat_rule")) {
    return t("error.unsupportedRepeatRule");
  }
  if (normalized.includes("registration disabled")) {
    return registrationDisabledHelp();
  }
  if (normalized.includes("invalid token") || normalized.includes("current session not found")) {
    return t("error.sessionExpired");
  }
  if (normalized.includes("task not found")) {
    return t("error.taskNotFound");
  }
  if (normalized.includes("title is required")) {
    return t("validation.taskTitleRequired");
  }
  if (error instanceof ApiError && error.status >= 500) {
    return t("error.serverUnavailable");
  }
  if (
    error instanceof TypeError ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed") ||
    normalized.includes("timeout")
  ) {
    return t("error.connectionServerUnavailable");
  }
  return t("error.generic");
}

function validationErrorMessage(error) {
  return t(error.message);
}

function registrationDisabledHelp() {
  return t("auth.registrationDisabled");
}

function registrationStatusPendingHelp() {
  return t("auth.registrationPending");
}

function registrationStatusRequiresConnectionCheck() {
  return !state.registrationStatusKnown;
}

function isRegistrationModeAvailable() {
  return state.registrationEnabled && !registrationStatusRequiresConnectionCheck();
}

function isConflictError(error) {
  return error instanceof ApiError && error.status === 409;
}

function supportsServiceWorker() {
  return "serviceWorker" in navigator && supportsHttpOrigin();
}

function supportsHttpOrigin() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function canAutoCheckRegistrationStatus() {
  if (!supportsHttpOrigin()) return false;
  try {
    return new URL(state.apiBaseUrl).origin === location.origin;
  } catch {
    return false;
  }
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapPayload(payload) {
  if (payload && typeof payload === "object" && "code" in payload && "data" in payload) {
    if (payload.code !== 0) {
      throw new Error(payload.message || t("error.requestFailed"));
    }
    return payload.data;
  }
  return payload;
}

function extractErrorMessage(payload) {
  if (payload && typeof payload === "object") {
    if (typeof payload.message === "string" && payload.message) {
      return payload.message;
    }
    if (typeof payload.detail === "string" && payload.detail) {
      return payload.detail;
    }
  }
  return typeof payload === "string" && payload ? payload : "";
}

function toApiUrl(path) {
  const normalizedBase = normalizeApiBaseUrl(state.apiBaseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function withExpectedVersion(path, expectedVersion) {
  if (!Number.isFinite(expectedVersion)) {
    return path;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}expected_version=${encodeURIComponent(String(expectedVersion))}`;
}

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) throw new ValidationError("validation.apiUrlRequired");
  if (trimmed.endsWith("/api/v1")) return trimmed;
  return `${trimmed}/api/v1`;
}

function deriveApiBaseUrlFromServer(value) {
  return `${normalizeServerBaseUrl(value)}/api/v1`;
}

function normalizeServerBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) throw new ValidationError("validation.serverUrlRequired");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new ValidationError("validation.serverUrlInvalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("validation.serverUrlProtocol");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "") || "/";
  return url.toString().replace(/\/+$/, "");
}

function restoreTaskListPreferences() {
  state.search = readStoredString("taskSearch", "");
  state.view = normalizeViewValue(readStoredString("taskView", "today"));
  state.projectFilter = readStoredString("taskProjectFilter", "");
  state.tagFilter = readStoredString("taskTagFilter", "");
}

function persistTaskListPreferences() {
  if (state.search) {
    writeStoredString("taskSearch", state.search);
  } else {
    removeStoredString("taskSearch");
  }
  writeStoredString("taskView", state.view || "all");
  if (state.projectFilter) writeStoredString("taskProjectFilter", state.projectFilter);
  else removeStoredString("taskProjectFilter");
  if (state.tagFilter) writeStoredString("taskTagFilter", state.tagFilter);
  else removeStoredString("taskTagFilter");
}

function normalizeViewValue(value) {
  if (value === "all") return "";
  return VIEW_OPTIONS.some((option) => option.value === value) ? value : "";
}

function taskDraftSessionKey() {
  const userId = getCurrentUserId();
  if (!userId) return "";
  try {
    return buildTaskDraftStorageKey(STORAGE_PREFIX, state.apiBaseUrl, userId);
  } catch {
    return "";
  }
}

function legacyTaskDraftSessionKeys() {
  const userId = getCurrentUserId();
  if (!userId) return [];
  const workspaceKey = currentOfflineWorkspaceKey();
  return [
    workspaceKey ? `${STORAGE_PREFIX}.taskDraft.${workspaceKey}` : "",
    `${STORAGE_PREFIX}.taskDraft.${userId}`,
  ].filter(Boolean);
}

function taskDraftTarget(taskId) {
  return taskId !== null && taskId !== undefined && Number.isFinite(Number(taskId))
    ? `task:${Number(taskId)}` : "new";
}

function restoreTaskDraft() {
  const draft = readTaskDraft();
  const createDraft = readTaskDraft(null);
  resetAccountScopedTaskForm();
  if (createDraft && nodes.quickTaskTitle) nodes.quickTaskTitle.value = createDraft.title || "";
  if (!draft || !hasTaskDraftContent(draft)) return false;
  applyTaskDraftToForm(draft);
  showTaskEditor();
  return true;
}

function applyTaskDraftToForm(draft) {
  state.editingTaskId = taskDraftTarget(draft.editingTaskId) === "new" ? null : Number(draft.editingTaskId);
  state.editingTaskVersion = draft.editingTaskVersion ?? null;
  taskDraftFormKey = taskDraftSessionKey();
  taskCreateRequestId = state.editingTaskId === null ? draft.client_request_id || "" : "";
  taskDraftSaveError = draft.save_error || "";
  nodes.taskTitle.value = draft.title ?? "";
  nodes.taskContent.value = draft.content ?? "";
  nodes.taskProject.value = draft.project ?? "";
  nodes.taskTag.value = draft.tag ?? "";
  nodes.taskPriority.value = String(draft.priority ?? 0);
  nodes.taskListType.value = draft.list_type || "inbox";
  nodes.taskPlannedDate.value = draft.planned_date ?? "";
  nodes.taskDueTime.value = draft.due_time ?? "";
  nodes.taskRemindTime.value = draft.remind_time ?? "";
  nodes.taskRepeatRule.value = draft.repeat_rule ?? "";
  state.checklistDraftItems = parseChecklistInput(draft.checklist_text ?? "", draft.checklist_items || []);
  nodes.taskChecklist.value = formatChecklistInput(state.checklistDraftItems);
  nodes.taskIsTemplate.checked = Boolean(draft.is_template);
  nodes.taskTemplateName.value = draft.template_name ?? "";
  if (state.editingTaskId === null && nodes.quickTaskTitle) nodes.quickTaskTitle.value = nodes.taskTitle.value;
  updateTaskTemplateNameVisibility();
  renderTaskQuickPreview();
  renderTaskChecklistItems();
  renderTaskEditorState();
  expandTaskAdvancedFieldsIfNeeded();
}

function currentTaskDraft() {
  return {
    editingTaskId: state.editingTaskId,
    editingTaskVersion: state.editingTaskVersion,
    client_request_id: state.editingTaskId === null ? taskCreateRequestId : undefined,
    save_error: taskDraftSaveError || undefined,
    title: nodes.taskTitle.value,
    content: nodes.taskContent.value,
    project: nodes.taskProject.value,
    tag: nodes.taskTag.value,
    priority: Number(nodes.taskPriority.value || 0),
    list_type: nodes.taskListType.value,
    planned_date: nodes.taskPlannedDate.value,
    due_time: nodes.taskDueTime.value,
    remind_time: nodes.taskRemindTime.value,
    repeat_rule: nodes.taskRepeatRule.value,
    checklist_text: nodes.taskChecklist.value,
    checklist_items: state.checklistDraftItems,
    is_template: nodes.taskIsTemplate.checked,
    template_name: nodes.taskTemplateName.value,
  };
}

function persistTaskDraft() {
  if (!taskDraftFormKey || taskDraftFormKey !== taskDraftSessionKey()) return;
  const draft = currentTaskDraft();
  const previous = readTaskDraft(state.editingTaskId);
  if (previous && taskDraftInputSignature(previous) !== taskDraftInputSignature(draft)) {
    const hadError = Boolean(taskDraftSaveError);
    taskDraftSaveError = "";
    draft.save_error = undefined;
    if (state.editingTaskId === null) {
      taskCreateRequestId = "";
      draft.client_request_id = "";
    }
    if (hadError) renderTaskEditorState();
  }
  saveTaskDraft(draft);
  if (state.editingTaskId === null && nodes.quickTaskTitle) nodes.quickTaskTitle.value = draft.title;
}

function persistQuickTaskDraft() {
  if (!taskDraftSessionKey()) return;
  const preset = getTaskCreatePresetForCurrentView();
  const draft = readTaskDraft(null) || {
    editingTaskId: null,
    editingTaskVersion: null,
    list_type: preset.listType,
    planned_date: preset.plannedDate,
  };
  if (draft.title !== nodes.quickTaskTitle.value) {
    draft.client_request_id = "";
    draft.save_error = undefined;
  }
  draft.title = nodes.quickTaskTitle.value;
  saveTaskDraft(draft);
  if (state.editingTaskId === null) applyTaskDraftToForm(draft);
}

function saveTaskDraft(draft, { activate = true } = {}) {
  const drafts = readTaskDraftStore();
  const target = taskDraftTarget(draft.editingTaskId);
  if (hasTaskDraftContent(draft)) drafts.entries[target] = draft;
  else delete drafts.entries[target];
  if (activate) drafts.activeTarget = target;
  writeTaskDraftStore(drafts);
}

function migrateTaskDraft(localTaskId, serverTaskId, serverVersion) {
  if (state.editingTaskId === localTaskId) persistTaskDraft();
  const drafts = readTaskDraftStore();
  const localTarget = taskDraftTarget(localTaskId);
  const serverTarget = taskDraftTarget(serverTaskId);
  const draft = drafts.entries[localTarget];
  if (!draft) return;
  drafts.entries[serverTarget] = { ...draft, editingTaskId: serverTaskId, editingTaskVersion: serverVersion };
  delete drafts.entries[localTarget];
  if (drafts.activeTarget === localTarget) drafts.activeTarget = serverTarget;
  writeTaskDraftStore(drafts);
  if (state.editingTaskId === localTaskId) {
    state.editingTaskId = serverTaskId;
    state.editingTaskVersion = serverVersion;
    renderTaskEditorState();
  }
}

function clearTaskDraft({ all = false, taskId = state.editingTaskId } = {}) {
  const drafts = readTaskDraftStore();
  const target = taskDraftTarget(taskId);
  if (all) drafts.entries = {};
  else delete drafts.entries[target];
  if (all || drafts.activeTarget === target) drafts.activeTarget = "new";
  writeTaskDraftStore(drafts);
}

function readTaskDraft(taskId = undefined) {
  const drafts = readTaskDraftStore();
  const target = taskId === undefined ? drafts.activeTarget : taskDraftTarget(taskId);
  return drafts.entries[target] || null;
}

function readTaskDraftStore() {
  const empty = () => ({ version: 2, activeTarget: "new", entries: {} });
  const key = taskDraftSessionKey();
  if (!key) return empty();
  const parse = (raw) => {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      if (value.version === 2 && value.entries && typeof value.entries === "object") return value;
      const target = taskDraftTarget(value.editingTaskId);
      return { version: 2, activeTarget: target, entries: { [target]: value } };
    } catch {
      return null;
    }
  };
  const raw = sessionStorage.getItem(key);
  const drafts = parse(raw) || empty();
  let migrated = Boolean(raw && !raw.includes('"entries"'));
  for (const legacyKey of legacyTaskDraftSessionKeys()) {
    const legacy = parse(sessionStorage.getItem(legacyKey));
    if (!legacy) continue;
    if (!Object.keys(drafts.entries).length) drafts.activeTarget = legacy.activeTarget;
    for (const [target, draft] of Object.entries(legacy.entries)) {
      if (!drafts.entries[target]) drafts.entries[target] = draft;
    }
    migrated = true;
  }
  if (migrated) writeTaskDraftStore(drafts);
  return drafts;
}

function writeTaskDraftStore(draft) {
  const key = taskDraftSessionKey();
  if (!key) return;
  if (Object.keys(draft.entries).length) sessionStorage.setItem(key, JSON.stringify(draft));
  else sessionStorage.removeItem(key);
  localStorage.removeItem(key);
  for (const legacyKey of legacyTaskDraftSessionKeys()) {
    sessionStorage.removeItem(legacyKey);
    localStorage.removeItem(legacyKey);
  }
}

function hasTaskDraftContent(draft) {
  if (!draft || typeof draft !== "object") {
    return false;
  }

  if (draft.editingTaskId !== null && Number.isFinite(Number(draft.editingTaskId))) {
    return true;
  }

  const preset = getTaskCreatePresetForCurrentView();
  return [
    draft.title,
    draft.content,
    draft.project,
    draft.tag,
    (draft.planned_date ?? "") !== preset.plannedDate,
    draft.due_time,
    draft.remind_time,
    draft.repeat_rule,
    draft.checklist_text,
    Array.isArray(draft.checklist_items) && draft.checklist_items.length > 0,
    draft.template_name,
    Number(draft.priority || 0) !== 0,
    (draft.list_type || "inbox") !== preset.listType,
    Boolean(draft.is_template),
  ].some(Boolean);
}

function shouldQueueOfflineMutation() {
  return state.offlineMode || (hasSession() && !navigator.onLine);
}

function isOfflineCapableError(error) {
  if (!navigator.onLine) {
    return true;
  }
  if (error instanceof ApiError) {
    return false;
  }
  const message = normalizeError(error);
  return error instanceof TypeError || /Failed to fetch|NetworkError|Load failed|fetch/i.test(message);
}

async function createTaskOffline(payload) {
  const task = makeOfflineTask(payload);
  return queueCreatedTaskOffline(payload, task);
}

async function instantiateTemplateTaskOffline(template) {
  const payload = makeTaskPayloadFromTemplate(template);
  const task = makeTaskFromTemplate(template);
  return queueCreatedTaskOffline(payload, task);
}

async function queueCreatedTaskOffline(payload, task) {
  const replayPayload = withClientRequestId(
    payload,
    () => makeClientRequestId("task-create"),
  );
  const mutation = await queueOfflineMutation({
    action: "create",
    task_id: task.id,
    payload: replayPayload,
    expected_version: null,
  });
  task.offline_queue_id = mutation.offline_queue_id;
  await putCachedTask(task);
  await hydrateCachedTasks();
  return task;
}

async function updateTaskOffline(taskId, payload) {
  const existing = findTaskById(taskId) || (await getCachedTask(taskId));
  if (!existing) {
    throw new Error("Task is not available in the offline cache");
  }
  const mutationPayload = { ...payload };
  const mutation = await queueOfflineMutation({
    action: "update",
    task_id: taskId,
    payload: mutationPayload,
    expected_version: payload.expected_version ?? existing.version ?? null,
  });
  const next = {
    ...existing,
    ...payload,
    id: taskId,
    version: Number(existing.version || 0) + 1,
    updated_at: new Date().toISOString(),
    offline_status: "pending:update",
    offline_queue_id: mutation.offline_queue_id,
    offline_error: null,
  };
  await putCachedTask(next);
  await hydrateCachedTasks();
  return next;
}

async function mutateTaskOffline(task, action) {
  const mutation = await queueOfflineMutation({
    action: "mutate",
    task_id: task.id,
    task_action: action,
    payload: null,
    expected_version: task.version ?? null,
  });
  const next = applyOfflineTaskAction(task, action, mutation.offline_queue_id);
  await putCachedTask(next);
  await hydrateCachedTasks();
  return next;
}

async function cacheTasksForOffline(tasks, viewContext, options = {}) {
  const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : () => true;
  const remoteTasks = tasks.map(normalizeRemoteTaskForOffline);
  if (!supportsIndexedDb() || !getCurrentUserId()) return remoteTasks;
  const cachedTasks = await listCachedTasks();
  if (!isCurrent()) return null;
  const reconciledTasks = reconcileCachedTaskSnapshot(cachedTasks, tasks, viewContext);
  if (!isCurrent()) return null;
  const db = await openOfflineDb();
  if (!isCurrent()) return null;
  const tx = db.transaction([OFFLINE_TASK_STORE, OFFLINE_META_STORE], "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore(OFFLINE_TASK_STORE);
  store.clear();
  for (const task of reconciledTasks) {
    store.put(task);
  }
  tx.objectStore(OFFLINE_META_STORE).put({
    key: OFFLINE_CACHE_READY_META_KEY,
    value: true,
    updated_at: new Date().toISOString(),
  });
  await done;
  if (!isCurrent()) return null;
  state.offlineCacheReady = true;
  state.offlineLastSyncedAt = new Date().toISOString();
  return reconciledTasks;
}

async function hydrateCachedTasks({ viewContext = null, requestSequence = null, sessionContext = captureSessionContext() } = {}) {
  const isCurrent = () => isSessionContextCurrent(sessionContext) && (requestSequence === null || taskRequestGate.isCurrent(requestSequence));
  if (!isCurrent()) return false;
  if (!getCurrentUserId()) {
    state.tasks = [];
    state.meta = buildLocalMeta([], new Date(), { timeZone: DISPLAY_TIME_ZONE });
    state.offlineQueueCount = 0;
    state.cachedTaskTotalCount = 0;
    state.cachedTaskVisibleCount = 0;
    state.cachedTaskListLimited = false;
    resetOfflineTaskRenderLimit();
    render();
    return true;
  }
  const tasks = await listCachedTasks();
  if (!isCurrent()) return false;
  const [cacheReady, queueCount] = await Promise.all([
    readOfflineMeta(OFFLINE_CACHE_READY_META_KEY),
    countOfflineQueue(),
  ]);
  if (!isCurrent()) return false;
  const activeViewContext = viewContext || {
    view: state.view,
    search: state.search,
    project: state.projectFilter,
    tag: state.tagFilter,
    now: new Date(),
    timeZone: DISPLAY_TIME_ZONE,
  };
  const visibleCachedTasks = tasks
    .filter((task) => matchesTaskView(task, activeViewContext))
    .sort((left, right) => compareCachedTasks(left, right, activeViewContext));
  const renderLimit = Math.max(TASK_LIMIT, state.offlineTaskRenderLimit || TASK_LIMIT);
  const renderedTasks = visibleCachedTasks.slice(0, renderLimit);
  if (state.notificationTaskId !== null) {
    const linkedTask = visibleCachedTasks.find(
      (task) => Number(task.id) === Number(state.notificationTaskId),
    );
    if (linkedTask && !renderedTasks.includes(linkedTask)) {
      renderedTasks.splice(Math.max(0, renderedTasks.length - 1), 1, linkedTask);
    }
  }
  state.offlineCacheReady = cacheReady === true;
  state.offlineQueueCount = queueCount;
  state.cachedTaskTotalCount = visibleCachedTasks.length;
  state.tasks = renderedTasks;
  state.cachedTaskVisibleCount = state.tasks.length;
  state.cachedTaskListLimited = visibleCachedTasks.length > state.tasks.length;
  state.meta = buildLocalMeta(tasks, new Date(), { timeZone: DISPLAY_TIME_ZONE });
  void scheduleTaskNotifications();
  render();
  return true;
}

async function queueOfflineMutation(mutation) {
  if (!supportsIndexedDb()) {
    throw new Error("This browser does not support IndexedDB offline queues");
  }
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error("Offline queue requires a signed-in user");
  }
  const db = await openOfflineDb();
  const record = {
    ...mutation,
    user_id: getCurrentUserId(),
    device_id: state.deviceId,
    created_at: new Date().toISOString(),
    offline_status: "pending",
  };
  const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
  const done = transactionDone(tx);
  const offline_queue_id = await requestToPromise(tx.objectStore(OFFLINE_QUEUE_STORE).add(record));
  await done;
  const stored = { ...record, offline_queue_id };
  await refreshOfflineQueueCount();
  return stored;
}

async function flushOfflineQueue(sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return false;
  if (!supportsIndexedDb() || !hasSession() || !getCurrentUserId() || !navigator.onLine) {
    await refreshOfflineQueueCount(sessionContext);
    return;
  }
  if (!offlineQueueFlushPromise || !isSessionContextCurrent(offlineQueueFlushContext)) {
    offlineQueueFlushContext = sessionContext;
    const request = flushOfflineQueueInternal(sessionContext).finally(() => {
      if (offlineQueueFlushPromise === request) {
        offlineQueueFlushPromise = null;
        offlineQueueFlushContext = null;
      }
    });
    offlineQueueFlushPromise = request;
  }
  return offlineQueueFlushPromise;
}

async function flushOfflineQueueInternal(sessionContext) {
  const queue = await listOfflineQueue();
  if (!isSessionContextCurrent(sessionContext)) return false;
  if (!queue.length) {
    await refreshOfflineQueueCount(sessionContext);
    return;
  }

  await processIndependentMutationQueue({
    listRecords: async () => {
      if (!isSessionContextCurrent(sessionContext)) return [];
      const records = await listOfflineQueue();
      return isSessionContextCurrent(sessionContext) ? records : [];
    },
    processRecord: (record) => processOfflineMutationRecord(record, sessionContext),
    markFailed: async (record, error) => {
      if (!isSessionContextCurrent(sessionContext)) return;
      if (isTransientOfflineMutationError(error)) throw error;
      await markOfflineMutationFailure(record, error, sessionContext);
    },
  });

  if (!isSessionContextCurrent(sessionContext)) return false;
  await refreshOfflineQueueCount(sessionContext);
  if (!isSessionContextCurrent(sessionContext)) return false;
  state.offlineLastSyncedAt = new Date().toISOString();
}

async function processOfflineMutationRecord(record, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return false;
  if (record.action === "create") {
    const created = await createTask(withClientRequestId(
      record.payload,
      () => makeClientRequestId("task-create"),
    ));
    if (!isSessionContextCurrent(sessionContext)) return false;
    await deleteCachedTask(record.task_id, sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    await putCachedTask(normalizeRemoteTaskForOffline(created), sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    await deleteOfflineMutation(record.offline_queue_id, sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    await replaceQueuedTaskId(record.task_id, created.id, created.version, sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    migrateTaskDraft(record.task_id, created.id, created.version);
    return;
  }
  if (record.action === "update") {
    const payload = {
      ...record.payload,
      expected_version: record.expected_version ?? record.payload?.expected_version,
    };
    const updated = await updateTask(record.task_id, payload);
    if (!isSessionContextCurrent(sessionContext)) return false;
    await putCachedTask(normalizeRemoteTaskForOffline(updated), sessionContext);
    if (!isSessionContextCurrent(sessionContext)) return false;
    await deleteOfflineMutation(record.offline_queue_id, sessionContext);
    return;
  }
  if (record.action === "mutate") {
    const updated = await mutateTask(record.task_id, record.task_action, record.expected_version);
    if (!isSessionContextCurrent(sessionContext)) return false;
    if (updated && typeof updated === "object" && Number.isFinite(Number(updated.id))) {
      await putCachedTask(normalizeRemoteTaskForOffline(updated), sessionContext);
    } else {
      await clearCachedTaskOfflineState(record.task_id, sessionContext);
    }
    if (!isSessionContextCurrent(sessionContext)) return false;
    await deleteOfflineMutation(record.offline_queue_id, sessionContext);
  }
}

function isTransientOfflineMutationError(error) {
  if (isOfflineCapableError(error)) return true;
  if (!(error instanceof ApiError)) return false;
  return (
    isTerminalRefreshStatus(error.status) ||
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500
  );
}

async function replaceQueuedTaskId(localTaskId, serverTaskId, serverVersion, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return;
  const queue = (await listOfflineQueue()).filter((record) => record.task_id === localTaskId);
  if (!isSessionContextCurrent(sessionContext) || !queue.length) return;
  let expectedVersion = Number.isFinite(Number(serverVersion)) ? Number(serverVersion) : null;
  const db = await openOfflineDb();
  if (!isSessionContextCurrent(sessionContext)) return;
  const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore(OFFLINE_QUEUE_STORE);
  for (const record of queue) {
    const next = {
      ...record,
      task_id: serverTaskId,
      expected_version: expectedVersion ?? record.expected_version,
    };
    store.put(next);
    if (expectedVersion !== null) {
      expectedVersion += 1;
    }
  }
  await done;
}

async function markOfflineMutationFailure(record, error, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return;
  const isConflict = isConflictSyncError(error);
  await updateOfflineMutation(record, {
    offline_status: isConflict ? "conflict" : "sync_failed",
    offline_error: normalizeError(error),
  }, sessionContext);
  if (!isSessionContextCurrent(sessionContext)) return;
  const task = await getCachedTask(record.task_id);
  if (!isSessionContextCurrent(sessionContext) || !task) return;
  const conflictLocalJson = isConflict ? stringifyConflictSnapshot(task) : null;
  const conflictServerJson = isConflict ? stringifyConflictSnapshot(extractConflictServerTask(error)) : null;
  await putCachedTask({
    ...task,
    offline_status: isConflict ? "conflict" : "sync_failed",
    offline_queue_id: record.offline_queue_id,
    offline_error: normalizeError(error),
    conflictLocalJson: conflictLocalJson,
    conflictServerJson: conflictServerJson,
    conflict_local_json: conflictLocalJson,
    conflict_server_json: conflictServerJson,
    offline_conflict_local_json: conflictLocalJson,
    offline_conflict_server_json: conflictServerJson,
  }, sessionContext);
  if (!isSessionContextCurrent(sessionContext)) return;
  await hydrateCachedTasks({ sessionContext });
}

function isConflictSyncError(error) {
  const message = normalizeError(error).toLowerCase();
  return message.includes("version conflict") || Boolean(extractConflictServerTask(error));
}

function extractConflictServerTask(error) {
  const payload = error instanceof ApiError ? error.payload : null;
  if (!payload || typeof payload !== "object") return null;
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  return data.server_task || data.serverTask || data.task || null;
}

function stringifyConflictSnapshot(value) {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function clearCachedTaskOfflineState(taskId, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return;
  const task = await getCachedTask(taskId);
  if (!isSessionContextCurrent(sessionContext) || !task) return;
  await putCachedTask({
    ...task,
    offline_status: null,
    offline_queue_id: null,
    offline_error: null,
    conflictLocalJson: null,
    conflictServerJson: null,
    conflict_local_json: null,
    conflict_server_json: null,
    offline_conflict_local_json: null,
    offline_conflict_server_json: null,
  }, sessionContext);
}

async function refreshOfflineQueueCount(sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext)) return;
  const count = await countOfflineQueue();
  if (!isSessionContextCurrent(sessionContext)) return;
  state.offlineQueueCount = count;
  if (nodes.connectionBadge) {
    updateConnectionBadge();
  }
  if (nodes.taskSummary) {
    renderSummary();
  }
  renderTaskSyncHealthBar();
}

async function countOfflineQueue() {
  if (!supportsIndexedDb() || !getCurrentUserId()) return 0;
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
  return requestToPromise(tx.objectStore(OFFLINE_QUEUE_STORE).count());
}

async function listOfflineQueue() {
  if (!supportsIndexedDb() || !getCurrentUserId()) return [];
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
  const records = await requestToPromise(tx.objectStore(OFFLINE_QUEUE_STORE).getAll());
  return records.sort((left, right) => left.offline_queue_id - right.offline_queue_id);
}

async function deleteOfflineMutation(offlineQueueId, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext) || !getCurrentUserId()) return;
  const db = await openOfflineDb();
  if (!isSessionContextCurrent(sessionContext)) return;
  const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(OFFLINE_QUEUE_STORE).delete(offlineQueueId);
  await done;
}

async function updateOfflineMutation(record, updates, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext) || !getCurrentUserId() || !record) return;
  const db = await openOfflineDb();
  if (!isSessionContextCurrent(sessionContext)) return;
  const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(OFFLINE_QUEUE_STORE).put({ ...record, ...updates });
  await done;
}

async function deleteOfflineMutationsForTask(taskId) {
  const records = (await listOfflineQueue()).filter((record) => Number(record.task_id) === Number(taskId));
  for (const record of records) {
    await deleteOfflineMutation(record.offline_queue_id);
  }
  await refreshOfflineQueueCount();
}

async function putCachedTask(task, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext) || !supportsIndexedDb() || !getCurrentUserId()) return;
  const db = await openOfflineDb();
  if (!isSessionContextCurrent(sessionContext)) return;
  const tx = db.transaction([OFFLINE_TASK_STORE, OFFLINE_META_STORE], "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(OFFLINE_TASK_STORE).put(task);
  tx.objectStore(OFFLINE_META_STORE).put({
    key: OFFLINE_CACHE_READY_META_KEY,
    value: true,
    updated_at: new Date().toISOString(),
  });
  await done;
  if (isSessionContextCurrent(sessionContext)) state.offlineCacheReady = true;
}

async function deleteCachedTask(taskId, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext) || !getCurrentUserId()) return;
  const db = await openOfflineDb();
  if (!isSessionContextCurrent(sessionContext)) return;
  const tx = db.transaction(OFFLINE_TASK_STORE, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(OFFLINE_TASK_STORE).delete(taskId);
  await done;
}

async function getCachedTask(taskId) {
  if (!supportsIndexedDb() || !getCurrentUserId()) return null;
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_TASK_STORE, "readonly");
  return (await requestToPromise(tx.objectStore(OFFLINE_TASK_STORE).get(taskId))) || null;
}

async function listCachedTasks() {
  if (!supportsIndexedDb() || !getCurrentUserId()) return [];
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_TASK_STORE, "readonly");
  return requestToPromise(tx.objectStore(OFFLINE_TASK_STORE).getAll());
}

async function writeOfflineMeta(key, value, sessionContext = captureSessionContext()) {
  if (!isSessionContextCurrent(sessionContext) || !supportsIndexedDb() || !getCurrentUserId()) return;
  const db = await openOfflineDb();
  if (!isSessionContextCurrent(sessionContext)) return;
  const tx = db.transaction(OFFLINE_META_STORE, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(OFFLINE_META_STORE).put({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  await done;
}

async function readOfflineMeta(key) {
  if (!supportsIndexedDb() || !getCurrentUserId()) return null;
  const db = await openOfflineDb();
  const tx = db.transaction(OFFLINE_META_STORE, "readonly");
  const record = await requestToPromise(tx.objectStore(OFFLINE_META_STORE).get(key));
  return record?.value ?? null;
}

function getCurrentUserId() {
  const userId = Number(state.user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }
  return Math.trunc(userId);
}

function offlineDbName() {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error("Offline storage requires a signed-in user");
  }
  return buildOfflineDatabaseName(STORAGE_PREFIX, state.apiBaseUrl, userId);
}

function offlineDbNameForProfile(profile) {
  const normalized = normalizeOfflineProfile(profile);
  if (!normalized) {
    throw new Error("Offline storage requires a valid profile");
  }
  return buildOfflineDatabaseName(STORAGE_PREFIX, normalized.api_base_url, normalized.id);
}

function legacyOfflineDbName(userId) {
  return `${STORAGE_PREFIX}.offline.user.${userId}`;
}

function offlineWorkspaceKeyForProfile(profile) {
  const normalized = normalizeOfflineProfile(profile);
  if (!normalized) return "";
  return buildOfflineWorkspaceKey(normalized.api_base_url, normalized.id);
}

function currentOfflineWorkspaceKey() {
  const userId = getCurrentUserId();
  if (!userId) return "";
  return buildOfflineWorkspaceKey(state.apiBaseUrl, userId);
}

function closeOfflineDb() {
  const pendingDb = offlineDbPromise;
  offlineDbPromise = null;
  offlineDbNameInUse = "";
  if (!pendingDb) return Promise.resolve();
  return pendingDb.then((db) => db.close()).catch(() => {});
}

function openOfflineDb() {
  if (localDataClearInProgress) {
    return Promise.reject(new Error("Local data clear is in progress"));
  }
  const dbName = offlineDbName();
  if (offlineDbPromise && offlineDbNameInUse === dbName) {
    return offlineDbPromise;
  }
  closeOfflineDb();
  offlineDbNameInUse = dbName;
  offlineDbPromise = openOfflineDatabase(dbName);
  return offlineDbPromise;
}

function openOfflineDatabase(dbName) {
  if (localDataClearInProgress) {
    return Promise.reject(new Error("Local data clear is in progress"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, WEB_OFFLINE_DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Failed to open offline database"));
    request.onblocked = () => reject(new Error("Offline database upgrade is blocked by another tab"));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_TASK_STORE)) {
        const tasks = db.createObjectStore(OFFLINE_TASK_STORE, { keyPath: "id" });
        tasks.createIndex("updated_at", "updated_at", { unique: false });
        tasks.createIndex("offline_status", "offline_status", { unique: false });
      }
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        const queue = db.createObjectStore(OFFLINE_QUEUE_STORE, {
          keyPath: "offline_queue_id",
          autoIncrement: true,
        });
        queue.createIndex("task_id", "task_id", { unique: false });
        queue.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(OFFLINE_META_STORE)) {
        db.createObjectStore(OFFLINE_META_STORE, { keyPath: "key" });
      }
    };
  });
}

async function prepareOfflineProfileStorage() {
  const sessionContext = captureSessionContext();
  const profile = state.offlineProfile;
  preserveLegacyOfflineProfileOwner();
  const rawOwner = readStoredString(LEGACY_OFFLINE_PROFILE_STORAGE_KEY, "");
  if (!rawOwner || !supportsIndexedDb()) return;
  const owner = normalizeOfflineProfile(JSON.parse(rawOwner));
  if (!owner) return;
  await migrateLegacyOfflineDatabase(owner);
  if (readStoredString(LEGACY_OFFLINE_PROFILE_STORAGE_KEY, "") === rawOwner) {
    removeStoredString(LEGACY_OFFLINE_PROFILE_STORAGE_KEY);
  }
  if (isSessionContextCurrent(sessionContext) && profile && isOfflineProfileForApi(profile, state.apiBaseUrl)) {
    persistOfflineProfile(profile);
  }
}

async function refreshOfflineResumeAvailability() {
  const checkSequence = ++offlineResumeCheckSequence;
  state.offlineCacheReady = false;
  renderOfflineResumePanel();
  const profile = state.offlineProfile;
  if (
    hasSession() ||
    state.offlineMode ||
    !profile ||
    !supportsIndexedDb() ||
    !isOfflineProfileForApi(profile, state.apiBaseUrl)
  ) {
    return;
  }
  try {
    await prepareOfflineProfileStorage();
    const ready = await isOfflineCacheReadyForProfile(profile);
    if (checkSequence !== offlineResumeCheckSequence) return;
    state.offlineCacheReady = ready;
  } catch {
    if (checkSequence !== offlineResumeCheckSequence) return;
    state.offlineCacheReady = false;
  }
  renderOfflineResumePanel();
}

async function isOfflineCacheReadyForProfile(profile) {
  const dbName = offlineDbNameForProfile(profile);
  if (!(await offlineDatabaseExists(dbName))) return false;
  const db = await openOfflineDatabase(dbName);
  try {
    const tx = db.transaction(OFFLINE_META_STORE, "readonly");
    const record = await requestToPromise(
      tx.objectStore(OFFLINE_META_STORE).get(OFFLINE_CACHE_READY_META_KEY),
    );
    return record?.value === true;
  } finally {
    db.close();
  }
}

async function migrateLegacyOfflineDatabase(profile) {
  const oldDbName = legacyOfflineDbName(profile.id);
  const newDbName = offlineDbNameForProfile(profile);
  if (oldDbName === newDbName || !(await offlineDatabaseExists(oldDbName))) return;

  const oldDb = await openOfflineDatabase(oldDbName);
  let snapshot;
  try {
    snapshot = await readOfflineDatabaseSnapshot(oldDb);
  } finally {
    oldDb.close();
  }

  const newDb = await openOfflineDatabase(newDbName);
  try {
    const tx = newDb.transaction(
      [OFFLINE_TASK_STORE, OFFLINE_QUEUE_STORE, OFFLINE_META_STORE],
      "readwrite",
    );
    const done = transactionDone(tx);
    const taskStore = tx.objectStore(OFFLINE_TASK_STORE);
    const queueStore = tx.objectStore(OFFLINE_QUEUE_STORE);
    const metaStore = tx.objectStore(OFFLINE_META_STORE);
    for (const task of snapshot.tasks) taskStore.put(task);
    for (const mutation of snapshot.queue) queueStore.put(mutation);
    for (const record of snapshot.meta) metaStore.put(record);
    if (snapshot.tasks.length > 0 || snapshot.queue.length > 0) {
      metaStore.put({
        key: OFFLINE_CACHE_READY_META_KEY,
        value: true,
        updated_at: new Date().toISOString(),
      });
    }
    metaStore.put({
      key: "legacy_migration",
      value: { source: oldDbName, completed_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });
    await done;
  } finally {
    newDb.close();
  }

  await deleteDatabase(oldDbName).catch(() => {});
}

async function offlineDatabaseExists(dbName) {
  if (typeof indexedDB.databases !== "function") return true;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === dbName);
}

async function readOfflineDatabaseSnapshot(db) {
  const tx = db.transaction(
    [OFFLINE_TASK_STORE, OFFLINE_QUEUE_STORE, OFFLINE_META_STORE],
    "readonly",
  );
  const done = transactionDone(tx);
  const values = await Promise.all([
    requestToPromise(tx.objectStore(OFFLINE_TASK_STORE).getAll()),
    requestToPromise(tx.objectStore(OFFLINE_QUEUE_STORE).getAll()),
    requestToPromise(tx.objectStore(OFFLINE_META_STORE).getAll()),
  ]);
  await done;
  return { tasks: values[0], queue: values[1], meta: values[2] };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

function supportsIndexedDb() {
  return "indexedDB" in window;
}

function loadLastImportedBackupTaskIds() {
  const userId = getCurrentUserId();
  if (!userId) {
    lastImportedBackupTaskIds = [];
    return [];
  }
  const storedByUser = readLastImportedBackupTaskIdsByUser();
  const workspaceKey = currentOfflineWorkspaceKey();
  const legacyKey = String(userId);
  const ids = normalizeStoredTaskIds(storedByUser[workspaceKey] ?? storedByUser[legacyKey]);
  if (!(workspaceKey in storedByUser) && legacyKey in storedByUser) {
    storedByUser[workspaceKey] = ids;
    delete storedByUser[legacyKey];
    writeStoredString(LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY, JSON.stringify(storedByUser));
  }
  lastImportedBackupTaskIds = ids;
  return ids;
}

function saveLastImportedBackupTaskIds(taskIds) {
  const userId = getCurrentUserId();
  if (!userId) return;
  const storedByUser = readLastImportedBackupTaskIdsByUser();
  storedByUser[currentOfflineWorkspaceKey()] = normalizeStoredTaskIds(taskIds);
  delete storedByUser[String(userId)];
  writeStoredString(LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY, JSON.stringify(storedByUser));
}

function clearLastImportedBackupTaskIds() {
  const userId = getCurrentUserId();
  if (!userId) {
    removeStoredString(LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY);
    return;
  }
  const storedByUser = readLastImportedBackupTaskIdsByUser();
  delete storedByUser[currentOfflineWorkspaceKey()];
  delete storedByUser[String(userId)];
  if (Object.keys(storedByUser).length === 0) {
    removeStoredString(LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY);
  } else {
    writeStoredString(LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY, JSON.stringify(storedByUser));
  }
}

function readLastImportedBackupTaskIdsByUser() {
  const raw = readStoredString(LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY, "{}");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    removeStoredString(LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY);
    return {};
  }
}

function normalizeStoredTaskIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "number" || typeof id === "string"))];
}

function readOfflineProfile() {
  const raw = readStoredString(OFFLINE_PROFILE_STORAGE_KEY, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    offlineProfileLegacyMigrationPending = !parsed.api_base_url && !parsed.apiBaseUrl;
    const profile = normalizeOfflineProfile(parsed, STORED_API_BASE_URL);
    if (!profile) {
      offlineProfileLegacyMigrationPending = false;
      removeStoredString(OFFLINE_PROFILE_STORAGE_KEY);
    }
    return profile;
  } catch {
    offlineProfileLegacyMigrationPending = false;
    removeStoredString(OFFLINE_PROFILE_STORAGE_KEY);
    return null;
  }
}

function preserveLegacyOfflineProfileOwner() {
  if (!offlineProfileLegacyMigrationPending || !state.offlineProfile) return;
  if (!readStoredString(LEGACY_OFFLINE_PROFILE_STORAGE_KEY, "")) {
    writeStoredString(LEGACY_OFFLINE_PROFILE_STORAGE_KEY, JSON.stringify(state.offlineProfile));
  }
  offlineProfileLegacyMigrationPending = false;
}

function persistOfflineProfile(value) {
  preserveLegacyOfflineProfileOwner();
  const profile = normalizeOfflineProfile(value, state.apiBaseUrl);
  if (!profile) return null;
  const previousWorkspace = offlineWorkspaceKeyForProfile(state.offlineProfile);
  const nextWorkspace = offlineWorkspaceKeyForProfile(profile);
  if (previousWorkspace !== nextWorkspace) {
    state.offlineCacheReady = false;
  }
  offlineProfileLegacyMigrationPending = false;
  state.offlineProfile = profile;
  writeStoredString(OFFLINE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

function forgetOfflineProfile() {
  offlineProfileLegacyMigrationPending = false;
  state.offlineProfile = null;
  state.offlineCacheReady = false;
  removeStoredString(OFFLINE_PROFILE_STORAGE_KEY);
}

function readStoredString(key, fallback) {
  const value = localStorage.getItem(storageKey(key));
  return value && value.trim() ? value : fallback;
}

function writeStoredString(key, value) {
  assertLocalStorageStringKey(key);
  localStorage.setItem(storageKey(key), value);
}

function removeStoredString(key) {
  localStorage.removeItem(storageKey(key));
}

function readSessionString(key, fallback) {
  const value = sessionStorage.getItem(storageKey(key));
  return value && value.trim() ? value : fallback;
}

function writeSessionString(key, value) {
  sessionStorage.setItem(storageKey(key), value);
}

function removeSessionString(key) {
  sessionStorage.removeItem(storageKey(key));
}

function readSessionJson(key, fallback) {
  const raw = sessionStorage.getItem(storageKey(key));
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(storageKey(key));
    return fallback;
  }
}

function writeSessionJson(key, value) {
  sessionStorage.setItem(storageKey(key), JSON.stringify(value));
}

function storageKey(key) {
  return `${STORAGE_PREFIX}.${key}`;
}

function makeClientRequestId(scope) {
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
  const normalizedScope = String(scope || "request")
    .replace(/[^A-Za-z0-9_.:-]/g, "-")
    .slice(0, 40);
  return `web.${normalizedScope}.${suffix}`.slice(0, 128);
}

function assertLocalStorageStringKey(key) {
  if (!LOCAL_STORAGE_STRING_KEYS.has(key)) {
    throw new Error(`Unsupported local storage key: ${key}`);
  }
}
