package com.taskbridge.app.data.repository

import androidx.room.withTransaction
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.datastore.WorkspaceIdentity
import com.taskbridge.app.data.local.SyncQueueDao
import com.taskbridge.app.data.local.SyncQueueCounts
import com.taskbridge.app.data.local.SyncQueueEntity
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.local.TaskListDataSource
import com.taskbridge.app.domain.model.TaskListPage
import com.taskbridge.app.domain.model.TaskListQuery
import com.taskbridge.app.data.local.WorkspaceMigrationCoordinator
import com.taskbridge.app.data.remote.ApiService
import com.taskbridge.app.data.remote.dto.TaskDto
import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.domain.model.toDomain
import com.taskbridge.app.utils.ShanghaiTime
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import java.time.Instant
import java.util.UUID

private val taskRepositoryGson = Gson()
private val checklistType = object : TypeToken<List<LocalChecklistItem>>() {}.type
private const val MAX_IMPORT_BYTES = 20_000_000
private const val MAX_IMPORT_TASKS = 500
private const val SIGNED_OUT_OWNER = "signed-out"
private val ACCEPTED_BACKUP_FORMATS = setOf(
    "taskbridge.local.backup.v1",
    "taskbridge.android.backup.v1",
    "taskbridge.desktop.backup.v1",
)

private data class LocalChecklistItem(
    val id: String,
    val title: String,
    val done: Boolean,
)

data class BackupImportResult(
    val importedCount: Int,
    val importedLocalIds: List<String>,
    val importedUndoItems: List<BackupImportUndoItem> = emptyList(),
    val scannedCount: Int = 0,
    val skippedCount: Int = 0,
    val errorCode: BackupImportErrorCode? = null,
)

data class BackupImportUndoItem(
    val localId: String,
    val importedUpdatedAt: String,
)

data class BackupImportUndoResult(
    val undoneCount: Int,
    val skippedChangedCount: Int,
)

data class BackupImportPreview(
    val importableCount: Int,
    val scannedCount: Int,
    val skippedCount: Int,
    val errorCode: BackupImportErrorCode? = null,
)

enum class BackupImportErrorCode {
    FileTooLarge,
    InvalidJson,
    UnsupportedFormat,
    MissingTasks,
    NoValidTasks,
}

private data class BackupImportParseResult(
    val tasks: List<TaskEntity>,
    val scannedCount: Int,
    val skippedCount: Int,
    val errorCode: BackupImportErrorCode? = null,
)

class TaskRepository(
    private val apiService: ApiService,
    private val database: AppDatabase,
    private val taskDao: TaskDao,
    private val syncQueueDao: SyncQueueDao,
    private val tokenDataStore: TokenDataStore,
    private val workspaceMigration: WorkspaceMigrationCoordinator = WorkspaceMigrationCoordinator(
        database,
        taskDao,
        syncQueueDao,
        tokenDataStore,
    ),
    private val onTasksChanged: suspend (workspaceId: String, localIds: Set<String>) -> Unit = { _, _ -> },
) {
    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun observeTaskPage(query: TaskListQuery): Flow<TaskListPage> {
        return tokenDataStore.currentWorkspace.distinctUntilChanged().flatMapLatest { workspace ->
            if (workspace == null) flowOf(TaskListPage()) else flow {
                workspaceMigration.ensureWorkspace(workspace)
                emitAll(TaskListDataSource(database).observe(workspace.id, query))
            }
        }
    }

    suspend fun getTask(localId: String): Task? {
        return taskDao.getByLocalId(workspaceId(), localId)?.toDomain()
    }

    suspend fun exportBackupTasks(): List<Task> {
        return taskDao.getBackupTasks(workspaceId()).map { it.toDomain() }
    }

    suspend fun getSyncQueueCounts(): SyncQueueCounts {
        return syncQueueDao.queueCounts(workspaceId())
    }

    suspend fun getExhaustedSyncQueuePreview(limit: Int = 20): List<SyncQueueEntity> {
        return syncQueueDao.exhaustedChanges(workspaceId(), limit)
    }

    suspend fun getConflictTaskCount(): Int {
        return taskDao.countConflictTasks(workspaceId())
    }

    suspend fun getFailedSyncTaskCount(): Int {
        return taskDao.countFailedSyncTasks(workspaceId())
    }

    suspend fun retryExhaustedSyncQueue(): Int {
        return syncQueueDao.resetExhaustedAttempts(workspaceId())
    }

    suspend fun addTask(
        title: String,
        content: String?,
        priority: Int,
        tag: String?,
        dueTime: String?,
        remindTime: String?,
        repeatRule: String?,
        project: String? = null,
        listType: String = "inbox",
        plannedDate: String? = null,
        snoozedUntil: String? = null,
        checklistJson: String = "[]",
        isTemplate: Boolean = false,
        templateName: String? = null,
    ): String {
        val now = Instant.now().toString()
        val localId = UUID.randomUUID().toString()
        val workspace = activeWorkspace()
        val task = TaskEntity(
            localId = localId,
            workspaceId = workspace.id,
            ownerUserId = workspace.userId,
            serverId = null,
            title = title,
            content = content,
            status = TaskStatus.Todo.wireName,
            priority = priority,
            tag = tag,
            project = project,
            listType = listType,
            dueTime = dueTime,
            remindTime = remindTime,
            repeatRule = repeatRule,
            plannedDate = plannedDate,
            completedAt = null,
            snoozedUntil = snoozedUntil,
            parentServerId = null,
            checklistJson = checklistJson,
            isTemplate = isTemplate,
            templateName = templateName,
            sortOrder = 0,
            version = 0,
            isDeleted = false,
            syncStatus = SyncStatus.PendingCreate.wireName,
            conflictServerJson = null,
            conflictLocalJson = null,
            createdAt = now,
            updatedAt = now,
            lastSyncAt = null,
        )
        saveMutation(task, "create")
        return localId
    }

    suspend fun previewBackupImportCount(raw: String): Int {
        return previewBackupImport(raw).importableCount
    }

    suspend fun previewBackupImport(raw: String): BackupImportPreview {
        val result = parseBackupImport(raw, activeWorkspace())
        return BackupImportPreview(
            importableCount = result.tasks.size,
            scannedCount = result.scannedCount,
            skippedCount = result.skippedCount,
            errorCode = result.errorCode,
        )
    }

    suspend fun importBackupJson(raw: String): Int {
        return importBackupJsonDetailed(raw).importedCount
    }

    suspend fun importBackupJsonDetailed(raw: String): BackupImportResult {
        val workspace = activeWorkspace()
        val preview = parseBackupImport(raw, workspace)
        val importedTasks = preview.tasks
        if (importedTasks.isEmpty()) {
            return BackupImportResult(
                importedCount = 0,
                importedLocalIds = emptyList(),
                scannedCount = preview.scannedCount,
                skippedCount = preview.skippedCount,
                errorCode = preview.errorCode,
            )
        }
        database.withTransaction {
            taskDao.upsertAll(importedTasks)
            importedTasks.filterNot { it.isDeleted }.forEach { task -> replaceQueue(task, "create") }
        }
        onTasksChanged(workspace.id, importedTasks.map { it.localId }.toSet())
        return BackupImportResult(
            importedCount = importedTasks.size,
            importedLocalIds = importedTasks.map { it.localId },
            importedUndoItems = importedTasks.map { task ->
                BackupImportUndoItem(
                    localId = task.localId,
                    importedUpdatedAt = task.updatedAt,
                )
            },
            scannedCount = preview.scannedCount,
            skippedCount = preview.skippedCount,
        )
    }

    suspend fun undoImportedBackupTasks(items: List<BackupImportUndoItem>): BackupImportUndoResult {
        val workspaceId = workspaceId()
        var undoneCount = 0
        var skippedChangedCount = 0
        val changedIds = mutableSetOf<String>()
        database.withTransaction {
            items.distinctBy { it.localId }.forEach { item ->
                val current = taskDao.getByLocalId(workspaceId, item.localId) ?: return@forEach
                if (current.updatedAt != item.importedUpdatedAt) {
                    skippedChangedCount += 1
                    return@forEach
                }
                if (current.serverId == null) {
                    syncQueueDao.deleteByLocalId(workspaceId, item.localId)
                    taskDao.deleteByLocalId(workspaceId, item.localId)
                } else {
                    val updated = current.copy(
                        isDeleted = true,
                        syncStatus = SyncStatus.PendingDelete.wireName,
                        updatedAt = Instant.now().toString(),
                    )
                    taskDao.upsert(updated)
                    replaceQueue(updated, "delete")
                }
                undoneCount += 1
                changedIds += item.localId
            }
        }
        onTasksChanged(workspaceId, changedIds)
        return BackupImportUndoResult(
            undoneCount = undoneCount,
            skippedChangedCount = skippedChangedCount,
        )
    }

    private fun parseImportableBackupTasks(raw: String, workspace: WorkspaceIdentity): List<TaskEntity> {
        return parseBackupImport(raw, workspace).tasks
    }

    private fun parseBackupImport(raw: String, workspace: WorkspaceIdentity): BackupImportParseResult {
        if (raw.length > MAX_IMPORT_BYTES) {
            return BackupImportParseResult(emptyList(), 0, 0, BackupImportErrorCode.FileTooLarge)
        }
        val root = runCatching { JsonParser.parseString(raw).asJsonObject }.getOrNull()
            ?: return BackupImportParseResult(emptyList(), 0, 0, BackupImportErrorCode.InvalidJson)
        if (root.stringOrNull("format") !in ACCEPTED_BACKUP_FORMATS) {
            return BackupImportParseResult(emptyList(), 0, 0, BackupImportErrorCode.UnsupportedFormat)
        }
        val tasks = root.get("tasks")?.takeIf { it.isJsonArray }?.asJsonArray
            ?: return BackupImportParseResult(emptyList(), 0, 0, BackupImportErrorCode.MissingTasks)
        val importedTasks = mutableListOf<TaskEntity>()
        tasks.forEach { element ->
            if (importedTasks.size >= MAX_IMPORT_TASKS) return@forEach
            val item = runCatching { element.asJsonObjectOrNull() }.getOrNull() ?: return@forEach
            val title = item.stringOrNull("title")?.trim().orEmpty()
            if (title.isBlank()) return@forEach
            val now = Instant.now().toString()
            val isDeleted = item.booleanOrNull("isDeleted") ?: item.booleanOrNull("is_deleted") ?: false
            val task = runCatching {
                TaskEntity(
                    localId = "import-${UUID.randomUUID()}",
                    workspaceId = workspace.id,
                    ownerUserId = workspace.userId,
                    serverId = null,
                    title = title,
                    content = item.stringOrNull("content"),
                    status = if (TaskStatus.fromWire(item.stringOrNull("status").orEmpty()) == TaskStatus.Completed) {
                        TaskStatus.Completed.wireName
                    } else {
                        TaskStatus.Todo.wireName
                    },
                    priority = item.intOrNull("priority")?.coerceIn(0, 5) ?: 0,
                    tag = item.stringOrNull("tag"),
                    project = item.stringOrNull("project"),
                    listType = item.stringOrNull("listType") ?: item.stringOrNull("list_type") ?: "inbox",
                    dueTime = item.stringOrNull("dueTime") ?: item.stringOrNull("due_time"),
                    remindTime = item.stringOrNull("remindTime") ?: item.stringOrNull("remind_time"),
                    repeatRule = item.stringOrNull("repeatRule") ?: item.stringOrNull("repeat_rule"),
                    plannedDate = item.stringOrNull("plannedDate") ?: item.stringOrNull("planned_date"),
                    completedAt = item.stringOrNull("completedAt") ?: item.stringOrNull("completed_at"),
                    snoozedUntil = item.stringOrNull("snoozedUntil") ?: item.stringOrNull("snoozed_until"),
                    parentServerId = null,
                    checklistJson = item.stringOrNull("checklistJson")
                        ?: item.get("checklist")?.takeIf { it.isJsonArray }?.toString()
                        ?: "[]",
                    isTemplate = item.booleanOrNull("isTemplate") ?: item.booleanOrNull("is_template") ?: false,
                    templateName = item.stringOrNull("templateName") ?: item.stringOrNull("template_name"),
                    sortOrder = item.intOrNull("sortOrder") ?: item.intOrNull("sort_order") ?: 0,
                    version = 0,
                    isDeleted = isDeleted,
                    syncStatus = if (isDeleted) {
                        SyncStatus.Synced.wireName
                    } else {
                        SyncStatus.PendingCreate.wireName
                    },
                    conflictServerJson = null,
                    conflictLocalJson = null,
                    createdAt = now,
                    updatedAt = now,
                    lastSyncAt = null,
                )
            }.getOrNull() ?: return@forEach
            importedTasks += task
        }
        val scannedCount = tasks.size()
        val skippedCount = scannedCount - importedTasks.size
        val errorCode = if (importedTasks.isEmpty()) BackupImportErrorCode.NoValidTasks else null
        return BackupImportParseResult(importedTasks, scannedCount, skippedCount, errorCode)
    }

    suspend fun updateTask(
        localId: String,
        title: String,
        content: String?,
        priority: Int,
        tag: String?,
        dueTime: String?,
        remindTime: String?,
        repeatRule: String?,
        project: String? = null,
        updateProject: Boolean = false,
        listType: String? = null,
        plannedDate: String? = null,
        updatePlannedDate: Boolean = false,
        snoozedUntil: String? = null,
        checklistJson: String? = null,
        isTemplate: Boolean? = null,
        templateName: String? = null,
        updateTemplateName: Boolean = false,
    ) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val now = Instant.now().toString()
        val syncStatus = if (current.serverId == null) {
            SyncStatus.PendingCreate
        } else {
            SyncStatus.PendingUpdate
        }
        val updated = current.copy(
            title = title,
            content = content,
            priority = priority,
            tag = tag,
            project = if (updateProject) project else project ?: current.project,
            listType = listType ?: current.listType,
            dueTime = dueTime,
            remindTime = remindTime,
            repeatRule = repeatRule,
            plannedDate = if (updatePlannedDate) plannedDate else plannedDate ?: current.plannedDate,
            snoozedUntil = snoozedUntil ?: current.snoozedUntil,
            checklistJson = checklistJson ?: current.checklistJson,
            isTemplate = isTemplate ?: current.isTemplate,
            templateName = if (updateTemplateName) templateName else current.templateName,
            syncStatus = syncStatus.wireName,
            updatedAt = now,
        )
        saveMutation(updated, if (current.serverId == null) "create" else "update", original = current)
    }

    suspend fun completeTask(localId: String) {
        batchComplete(listOf(localId))
    }

    suspend fun resolveConflictUseServer(localId: String) {
        val workspace = activeWorkspace()
        val current = taskDao.getByLocalId(workspace.id, localId) ?: return
        val serverTask = parseConflictServerTask(current.conflictServerJson) ?: return
        taskDao.upsert(
            serverTask.toEntity(
                workspaceId = workspace.id,
                ownerUserId = workspace.userId,
                localId = localId,
                syncStatus = SyncStatus.Synced,
                lastSyncAt = Instant.now().toString(),
            ),
        )
        syncQueueDao.deleteByLocalId(workspace.id, localId)
        onTasksChanged(workspace.id, setOf(localId))
    }

    suspend fun forceOverwriteServer(localId: String) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val updated = current.copy(
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            conflictServerJson = null,
            conflictLocalJson = null,
            updatedAt = Instant.now().toString(),
        )
        saveMutation(updated, if (current.serverId == null) "create" else "update", original = current)
    }

    suspend fun batchComplete(taskIds: List<String>) {
        mutateTasks(taskIds, "complete") { task, now ->
            task.copy(status = TaskStatus.Completed.wireName, completedAt = now)
        }
    }

    suspend fun batchDelete(taskIds: List<String>) {
        mutateTasks(taskIds, "delete") { task, _ -> task.copy(isDeleted = true) }
    }

    suspend fun batchRestoreDeleted(taskIds: List<String>) {
        mutateTasks(taskIds, "restore") { task, _ -> task.copy(isDeleted = false) }
    }

    suspend fun batchPurgeDeleted(taskIds: List<String>) {
        taskIds.distinct().forEach { purgeDeletedTask(it) }
    }

    suspend fun undoCompleteTask(localId: String) {
        mutateTasks(listOf(localId), "restore") { task, _ -> task.copy(status = TaskStatus.Todo.wireName, completedAt = null) }
    }

    suspend fun restoreDeletedTask(localId: String) {
        batchRestoreDeleted(listOf(localId))
    }

    suspend fun purgeDeletedTask(localId: String) {
        val workspaceId = workspaceId()
        val current = taskDao.getByLocalId(workspaceId, localId) ?: return
        current.serverId?.let { serverId ->
            check(!tokenDataStore.accessToken.first().isNullOrBlank()) {
                "network connection required to purge a synced task"
            }
            runCatching {
                apiService.purgeTask(serverId)
            }.getOrElse {
                apiService.deleteTask(serverId)
                apiService.purgeTask(serverId)
            }
        }
        database.withTransaction {
            syncQueueDao.deleteByLocalId(workspaceId, localId)
            taskDao.deleteByLocalId(workspaceId, localId)
        }
        onTasksChanged(workspaceId, setOf(localId))
    }

    suspend fun clearLocalDeviceData() {
        val workspaceId = workspaceId()
        val localIds = taskDao.getAllLocalIds(workspaceId).toSet()
        database.withTransaction {
            syncQueueDao.deleteAllForWorkspace(workspaceId)
            taskDao.deleteAllForWorkspace(workspaceId)
        }
        tokenDataStore.clearLastBackupImportUndoItems()
        onTasksChanged(workspaceId, localIds)
    }

    suspend fun postponeTask(localId: String, dueTime: String?, remindTime: String?, plannedDate: String?) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = postponeTaskSnapshot(current, dueTime, remindTime, plannedDate, now)
        saveMutation(updated, if (current.serverId == null) "create" else "update", original = current)
    }

    suspend fun snoozeTask(localId: String, snoozedUntil: String) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            snoozedUntil = snoozedUntil,
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        saveMutation(updated, if (current.serverId == null) "create" else "update", original = current)
    }

    suspend fun planTaskForToday(localId: String, plannedDate: String, dueTime: String? = null) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            listType = "today",
            plannedDate = plannedDate,
            dueTime = dueTime ?: current.dueTime,
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        saveMutation(updated, if (current.serverId == null) "create" else "update", original = current)
    }

    suspend fun moveTaskToInbox(localId: String) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            listType = "inbox",
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        saveMutation(updated, if (current.serverId == null) "create" else "update", original = current)
    }

    suspend fun softDeleteTask(localId: String) {
        batchDelete(listOf(localId))
    }

    suspend fun addChecklistItem(localId: String, title: String) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val trimmed = title.trim()
        if (trimmed.isBlank()) return
        val checklist = parseChecklist(current.checklistJson) + LocalChecklistItem(
            id = UUID.randomUUID().toString(),
            title = trimmed,
            done = false,
        )
        updateChecklist(current, checklist)
    }

    suspend fun toggleChecklistItem(localId: String, itemId: String) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val checklist = parseChecklist(current.checklistJson).map { item ->
            if (item.id == itemId) item.copy(done = !item.done) else item
        }
        updateChecklist(current, checklist)
    }

    suspend fun deleteChecklistItem(localId: String, itemId: String) {
        val current = taskDao.getByLocalId(workspaceId(), localId) ?: return
        val checklist = parseChecklist(current.checklistJson).filterNot { it.id == itemId }
        updateChecklist(current, checklist)
    }

    suspend fun instantiateTemplate(localId: String): String? {
        val template = taskDao.getByLocalId(workspaceId(), localId) ?: return null
        val now = Instant.now().toString()
        val next = template.copy(
            localId = UUID.randomUUID().toString(),
            serverId = null,
            status = TaskStatus.Todo.wireName,
            listType = "inbox",
            completedAt = null,
            snoozedUntil = null,
            parentServerId = template.serverId,
            checklistJson = resetChecklist(template.checklistJson),
            isTemplate = false,
            templateName = null,
            version = 0,
            isDeleted = false,
            syncStatus = SyncStatus.PendingCreate.wireName,
            createdAt = now,
            updatedAt = now,
            lastSyncAt = null,
        )
        saveMutation(next, "create")
        return next.localId
    }

    suspend fun createNextOccurrence(localId: String): String? {
        val workspace = activeWorkspace()
        val current = taskDao.getByLocalId(workspace.id, localId) ?: return null
        val serverId = current.serverId ?: return null
        val remote = runCatching {
            apiService.createNextOccurrence(serverId, expectedWorkspaceId = workspace.id).data
        }.getOrNull() ?: return null
        if (tokenDataStore.currentWorkspace.first()?.id != workspace.id) return null
        var changed = false
        val nextId = database.withTransaction {
            val existing = taskDao.getByServerIds(workspace.id, listOf(remote.id)).firstOrNull()
            val next = mergeCreatedOccurrence(
                remote.toEntity(
                    workspaceId = workspace.id,
                    ownerUserId = workspace.userId,
                    localId = remoteTaskLocalId(workspace, remote.id),
                    syncStatus = SyncStatus.Synced,
                    lastSyncAt = Instant.now().toString(),
                ),
                existing,
            )
            if (next !== existing) {
                taskDao.upsert(next)
                changed = true
            }
            next.localId
        }
        if (changed) onTasksChanged(workspace.id, setOf(nextId))
        return nextId
    }

    private suspend fun saveMutation(task: TaskEntity, action: String, original: TaskEntity? = null) {
        val saved = database.withTransaction {
            // 编辑读取快照后，同步可能已经确认新建；保留事务内最新的服务端身份。
            val current = taskDao.getByLocalId(task.workspaceId, task.localId)
            // 已有任务被删除后，过期编辑不能将其重新插入或覆盖待同步删除。
            if (original != null && (current == null || (!original.isDeleted && current.isDeleted))) {
                return@withTransaction false
            }
            val pending = if (current == null) task else task.copy(
                serverId = current.serverId,
                version = current.version,
                lastSyncAt = current.lastSyncAt,
                syncStatus = when {
                    action == "delete" || current.isDeleted -> SyncStatus.PendingDelete.wireName
                    current.serverId == null -> SyncStatus.PendingCreate.wireName
                    else -> SyncStatus.PendingUpdate.wireName
                },
            )
            val pendingAction = when {
                pending.isDeleted -> "delete"
                action == "create" && pending.serverId != null -> "update"
                else -> action
            }
            taskDao.upsert(pending)
            replaceQueue(pending, pendingAction)
            true
        }
        if (saved) onTasksChanged(task.workspaceId, setOf(task.localId))
    }

    private suspend fun mutateTasks(
        localIds: List<String>,
        action: String,
        change: (TaskEntity, String) -> TaskEntity,
    ) {
        val workspace = activeWorkspace()
        val now = Instant.now().toString()
        val changed = mutableSetOf<String>()
        database.withTransaction {
            localIds.distinct().forEach { localId ->
                val current = taskDao.getByLocalId(workspace.id, localId) ?: return@forEach
                val updated = change(current, now).copy(
                    syncStatus = when {
                        action == "delete" -> SyncStatus.PendingDelete.wireName
                        current.serverId == null -> SyncStatus.PendingCreate.wireName
                        else -> SyncStatus.PendingUpdate.wireName
                    },
                    updatedAt = now,
                )
                taskDao.upsert(updated)
                replaceQueue(updated, if (current.serverId == null && action != "delete") "create" else action)
                changed += localId
            }
        }
        onTasksChanged(workspace.id, changed)
    }

    private suspend fun activeWorkspace(): WorkspaceIdentity {
        val workspace = tokenDataStore.currentWorkspace.first()
            ?: throw IllegalStateException("active workspace required")
        workspaceMigration.ensureWorkspace(workspace)
        return workspace
    }

    private suspend fun workspaceId(): String = activeWorkspace().id

    private suspend fun replaceQueue(task: TaskEntity, action: String) {
        syncQueueDao.deleteByLocalId(task.workspaceId, task.localId)
        syncQueueDao.enqueue(
            SyncQueueEntity(
                workspaceId = task.workspaceId,
                ownerUserId = task.ownerUserId,
                localId = task.localId,
                serverId = task.serverId,
                action = action,
                title = task.title,
                content = task.content,
                status = task.status,
                priority = task.priority,
                tag = task.tag,
                project = task.project,
                listType = task.listType,
                dueTime = task.dueTime,
                remindTime = task.remindTime,
                repeatRule = task.repeatRule,
                plannedDate = task.plannedDate,
                completedAt = task.completedAt,
                snoozedUntil = task.snoozedUntil,
                parentServerId = task.parentServerId,
                checklistJson = task.checklistJson,
                isTemplate = task.isTemplate,
                templateName = task.templateName,
                sortOrder = task.sortOrder,
                version = task.version,
                localUpdatedAt = task.updatedAt,
                createdAt = Instant.now().toString(),
            ),
        )
    }

    private suspend fun updateChecklist(current: TaskEntity, checklist: List<LocalChecklistItem>) {
        val now = Instant.now().toString()
        val updated = current.copy(
            checklistJson = taskRepositoryGson.toJson(checklist),
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        saveMutation(updated, if (current.serverId == null) "create" else "update", original = current)
    }
}

private fun parseChecklist(value: String?): List<LocalChecklistItem> {
    if (value.isNullOrBlank()) return emptyList()
    return runCatching {
        taskRepositoryGson.fromJson<List<LocalChecklistItem>>(value, checklistType)
    }.getOrDefault(emptyList())
}

private fun parseConflictServerTask(value: String?): TaskDto? {
    if (value.isNullOrBlank()) return null
    return runCatching {
        taskRepositoryGson.fromJson(value, TaskDto::class.java)
    }.getOrNull()
}

private fun resetChecklist(value: String?): String {
    val reset = parseChecklist(value).map { it.copy(done = false) }
    return taskRepositoryGson.toJson(reset)
}

private fun com.google.gson.JsonElement.asJsonObjectOrNull(): JsonObject? {
    return if (isJsonObject) asJsonObject else null
}

private fun JsonObject.stringOrNull(name: String): String? {
    val value = get(name) ?: return null
    if (value.isJsonNull) return null
    return runCatching { value.asString }.getOrNull()?.takeIf { it.isNotBlank() }
}

private fun JsonObject.intOrNull(name: String): Int? {
    val value = get(name) ?: return null
    if (value.isJsonNull) return null
    return runCatching { value.asInt }.getOrNull()
}

private fun JsonObject.booleanOrNull(name: String): Boolean? {
    val value = get(name) ?: return null
    if (value.isJsonNull) return null
    return runCatching { value.asBoolean }.getOrNull()
}
