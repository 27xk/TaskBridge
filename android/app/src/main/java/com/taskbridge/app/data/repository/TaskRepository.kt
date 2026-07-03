package com.taskbridge.app.data.repository

import androidx.room.withTransaction
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.SyncQueueDao
import com.taskbridge.app.data.local.SyncQueueCounts
import com.taskbridge.app.data.local.SyncQueueEntity
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.data.local.TaskEntity
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
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

private val taskRepositoryGson = Gson()
private val checklistType = object : TypeToken<List<LocalChecklistItem>>() {}.type
private const val MAX_IMPORT_BYTES = 20_000_000
private const val MAX_IMPORT_TASKS = 500
private const val ACTIVE_TASK_LIMIT = 5_000
private const val TODAY_TASK_LIMIT = 5_000
private const val SEARCH_TASK_LIMIT = 500
private const val BACKUP_EXPORT_LIMIT = 5_000
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
) {
    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun observeTasks(now: Instant = Instant.now()): Flow<List<Task>> {
        return tokenDataStore.currentUserId.flatMapLatest { ownerUserId ->
            if (ownerUserId.isNullOrBlank()) {
                flowOf(emptyList())
            } else {
                taskDao.observeActiveTasks(ownerUserId, ACTIVE_TASK_LIMIT, now.toString())
                    .map { tasks -> tasks.map { it.toDomain() } }
            }
        }
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun observeTrashTasks(): Flow<List<Task>> {
        return tokenDataStore.currentUserId.flatMapLatest { ownerUserId ->
            if (ownerUserId.isNullOrBlank()) {
                flowOf(emptyList())
            } else {
                taskDao.observeDeletedTasks(ownerUserId, ACTIVE_TASK_LIMIT)
                    .map { tasks -> tasks.map { it.toDomain() } }
            }
        }
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun observeTodayTasks(
        todayPrefix: String,
        timeZoneId: String = ShanghaiTime.DEFAULT_ZONE_ID,
        now: Instant = Instant.now(),
    ): Flow<List<Task>> {
        val (startTime, endTime) = ShanghaiTime.dayBounds(todayPrefix, timeZoneId)
        return tokenDataStore.currentUserId.flatMapLatest { ownerUserId ->
            if (ownerUserId.isNullOrBlank()) {
                flowOf(emptyList())
            } else {
                taskDao.observeTodayTasks(ownerUserId, todayPrefix, startTime, endTime, now.toString(), TODAY_TASK_LIMIT)
                    .map { tasks -> tasks.map { it.toDomain() } }
            }
        }
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun observeSearchTasks(keyword: String): Flow<List<Task>> {
        return tokenDataStore.currentUserId.flatMapLatest { ownerUserId ->
            if (ownerUserId.isNullOrBlank()) {
                flowOf(emptyList())
            } else {
                taskDao.observeSearchTasks(ownerUserId, keyword, SEARCH_TASK_LIMIT)
                    .map { tasks -> tasks.map { it.toDomain() } }
            }
        }
    }

    suspend fun getTask(localId: String): Task? {
        return taskDao.getByLocalId(ownerUserId(), localId)?.toDomain()
    }

    suspend fun exportBackupTasks(): List<Task> {
        return taskDao.getBackupTasks(ownerUserId(), BACKUP_EXPORT_LIMIT).map { it.toDomain() }
    }

    suspend fun getSyncQueueCounts(): SyncQueueCounts {
        return syncQueueDao.queueCounts(ownerUserId())
    }

    suspend fun getExhaustedSyncQueuePreview(limit: Int = 20): List<SyncQueueEntity> {
        return syncQueueDao.exhaustedChanges(ownerUserId(), limit)
    }

    suspend fun getConflictTaskCount(): Int {
        return taskDao.countConflictTasks(ownerUserId())
    }

    suspend fun getFailedSyncTaskCount(): Int {
        return taskDao.countFailedSyncTasks(ownerUserId())
    }

    suspend fun retryExhaustedSyncQueue(): Int {
        return syncQueueDao.resetExhaustedAttempts(ownerUserId())
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
        val ownerUserId = ownerUserId()
        val task = TaskEntity(
            localId = localId,
            ownerUserId = ownerUserId,
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
        taskDao.upsert(task)
        replaceQueue(task, "create")
        return localId
    }

    suspend fun previewBackupImportCount(raw: String): Int {
        return previewBackupImport(raw).importableCount
    }

    suspend fun previewBackupImport(raw: String): BackupImportPreview {
        val result = parseBackupImport(raw, ownerUserId())
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
        val ownerUserId = ownerUserId()
        val preview = parseBackupImport(raw, ownerUserId)
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
        val ownerUserId = ownerUserId()
        var undoneCount = 0
        var skippedChangedCount = 0
        database.withTransaction {
            items.distinctBy { it.localId }.forEach { item ->
                val current = taskDao.getByLocalId(ownerUserId, item.localId) ?: return@forEach
                if (current.updatedAt != item.importedUpdatedAt) {
                    skippedChangedCount += 1
                    return@forEach
                }
                if (current.serverId == null) {
                    syncQueueDao.deleteByLocalId(ownerUserId, item.localId)
                    taskDao.deleteByLocalId(ownerUserId, item.localId)
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
            }
        }
        return BackupImportUndoResult(
            undoneCount = undoneCount,
            skippedChangedCount = skippedChangedCount,
        )
    }

    private fun parseImportableBackupTasks(raw: String, ownerUserId: String): List<TaskEntity> {
        return parseBackupImport(raw, ownerUserId).tasks
    }

    private fun parseBackupImport(raw: String, ownerUserId: String): BackupImportParseResult {
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
                    ownerUserId = ownerUserId,
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
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
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
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun completeTask(localId: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            status = TaskStatus.Completed.wireName,
            completedAt = now,
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "complete")
        if (current.serverId == null) {
            createNextOccurrence(localId)
        }
    }

    suspend fun resolveConflictUseServer(localId: String) {
        val ownerUserId = ownerUserId()
        val current = taskDao.getByLocalId(ownerUserId, localId) ?: return
        val serverTask = parseConflictServerTask(current.conflictServerJson) ?: return
        taskDao.upsert(
            serverTask.toEntity(
                ownerUserId = ownerUserId,
                localId = localId,
                syncStatus = SyncStatus.Synced,
                lastSyncAt = Instant.now().toString(),
            ),
        )
        syncQueueDao.deleteByLocalId(ownerUserId, localId)
    }

    suspend fun forceOverwriteServer(localId: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
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
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun batchComplete(taskIds: List<String>) {
        database.withTransaction {
            taskIds.distinct().forEach { completeTask(it) }
        }
    }

    suspend fun batchDelete(taskIds: List<String>) {
        database.withTransaction {
            taskIds.distinct().forEach { softDeleteTask(it) }
        }
    }

    suspend fun batchRestoreDeleted(taskIds: List<String>) {
        database.withTransaction {
            taskIds.distinct().forEach { restoreDeletedTask(it) }
        }
    }

    suspend fun batchPurgeDeleted(taskIds: List<String>) {
        taskIds.distinct().forEach { purgeDeletedTask(it) }
    }

    suspend fun undoCompleteTask(localId: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            status = TaskStatus.Todo.wireName,
            completedAt = null,
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "restore")
    }

    suspend fun restoreDeletedTask(localId: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            isDeleted = false,
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "restore")
    }

    suspend fun purgeDeletedTask(localId: String) {
        val ownerUserId = ownerUserId()
        val current = taskDao.getByLocalId(ownerUserId, localId) ?: return
        current.serverId?.let { serverId ->
            runCatching {
                apiService.purgeTask(serverId)
            }.getOrElse {
                apiService.deleteTask(serverId)
                apiService.purgeTask(serverId)
            }
        }
        database.withTransaction {
            syncQueueDao.deleteByLocalId(ownerUserId, localId)
            taskDao.deleteByLocalId(ownerUserId, localId)
        }
    }

    suspend fun clearLocalDeviceData() {
        val ownerUserId = ownerUserId()
        database.withTransaction {
            syncQueueDao.deleteAllForOwner(ownerUserId)
            taskDao.deleteAllForOwner(ownerUserId)
        }
        tokenDataStore.clearLastBackupImportUndoItems()
    }

    suspend fun postponeTask(localId: String, dueTime: String?, remindTime: String?, plannedDate: String?) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            dueTime = dueTime ?: current.dueTime,
            remindTime = remindTime ?: current.remindTime,
            plannedDate = plannedDate ?: current.plannedDate,
            snoozedUntil = null,
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = now,
        )
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun snoozeTask(localId: String, snoozedUntil: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
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
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun planTaskForToday(localId: String, plannedDate: String, dueTime: String? = null) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
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
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun moveTaskToInbox(localId: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
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
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun softDeleteTask(localId: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
        val now = Instant.now().toString()
        val updated = current.copy(
            isDeleted = true,
            syncStatus = SyncStatus.PendingDelete.wireName,
            updatedAt = now,
        )
        taskDao.upsert(updated)
        replaceQueue(updated, "delete")
    }

    suspend fun addChecklistItem(localId: String, title: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
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
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
        val checklist = parseChecklist(current.checklistJson).map { item ->
            if (item.id == itemId) item.copy(done = !item.done) else item
        }
        updateChecklist(current, checklist)
    }

    suspend fun deleteChecklistItem(localId: String, itemId: String) {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return
        val checklist = parseChecklist(current.checklistJson).filterNot { it.id == itemId }
        updateChecklist(current, checklist)
    }

    suspend fun instantiateTemplate(localId: String): String? {
        val template = taskDao.getByLocalId(ownerUserId(), localId) ?: return null
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
        taskDao.upsert(next)
        replaceQueue(next, "create")
        return next.localId
    }

    suspend fun createNextOccurrence(localId: String): String? {
        val current = taskDao.getByLocalId(ownerUserId(), localId) ?: return null
        val shiftDays = when (current.repeatRule?.trim()?.lowercase()) {
            "daily", "every_day", "every day" -> 1L
            "weekly", "every_week", "every week" -> 7L
            "monthly", "every_month", "every month" -> 30L
            else -> return null
        }
        val now = Instant.now().toString()
        val next = current.copy(
            localId = UUID.randomUUID().toString(),
            serverId = null,
            status = TaskStatus.Todo.wireName,
            dueTime = shiftInstant(current.dueTime, shiftDays),
            remindTime = shiftInstant(current.remindTime, shiftDays),
            plannedDate = shiftLocalDate(current.plannedDate, shiftDays),
            completedAt = null,
            snoozedUntil = null,
            parentServerId = current.serverId,
            checklistJson = resetChecklist(current.checklistJson),
            isTemplate = false,
            templateName = null,
            version = 0,
            isDeleted = false,
            syncStatus = SyncStatus.PendingCreate.wireName,
            createdAt = now,
            updatedAt = now,
            lastSyncAt = null,
        )
        taskDao.upsert(next)
        replaceQueue(next, "create")
        return next.localId
    }

    private suspend fun ownerUserId(): String {
        return tokenDataStore.currentUserId.first()?.takeIf { it.isNotBlank() } ?: SIGNED_OUT_OWNER
    }

    private suspend fun replaceQueue(task: TaskEntity, action: String) {
        syncQueueDao.deleteByLocalId(task.ownerUserId, task.localId)
        syncQueueDao.enqueue(
            SyncQueueEntity(
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
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
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

private fun shiftInstant(value: String?, days: Long): String? {
    return value?.let {
        runCatching { Instant.parse(it).plusSeconds(days * 86_400).toString() }.getOrNull()
    }
}

private fun shiftLocalDate(value: String?, days: Long): String? {
    return value?.let {
        runCatching { LocalDate.parse(it).plusDays(days).toString() }.getOrNull()
    }
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
