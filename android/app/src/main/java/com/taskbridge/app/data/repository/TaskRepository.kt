package com.taskbridge.app.data.repository

import com.taskbridge.app.data.local.SyncQueueDao
import com.taskbridge.app.data.local.SyncQueueEntity
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.data.local.TaskEntity
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
import kotlinx.coroutines.flow.map
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

private val taskRepositoryGson = Gson()
private val checklistType = object : TypeToken<List<LocalChecklistItem>>() {}.type
private const val MAX_IMPORT_BYTES = 1_000_000
private const val MAX_IMPORT_TASKS = 500
private const val ACTIVE_TASK_LIMIT = 200
private const val TODAY_TASK_LIMIT = 120
private const val SEARCH_TASK_LIMIT = 100
private const val BACKUP_EXPORT_LIMIT = 5_000

private data class LocalChecklistItem(
    val id: String,
    val title: String,
    val done: Boolean,
)

class TaskRepository(
    private val taskDao: TaskDao,
    private val syncQueueDao: SyncQueueDao,
) {
    fun observeTasks(now: Instant = Instant.now()): Flow<List<Task>> {
        return taskDao.observeActiveTasks(ACTIVE_TASK_LIMIT, now.toString())
            .map { tasks -> tasks.map { it.toDomain() } }
    }

    fun observeTodayTasks(
        todayPrefix: String,
        timeZoneId: String = ShanghaiTime.DEFAULT_ZONE_ID,
        now: Instant = Instant.now(),
    ): Flow<List<Task>> {
        val (startTime, endTime) = ShanghaiTime.dayBounds(todayPrefix, timeZoneId)
        return taskDao.observeTodayTasks(todayPrefix, startTime, endTime, now.toString(), TODAY_TASK_LIMIT)
            .map { tasks -> tasks.map { it.toDomain() } }
    }

    fun observeSearchTasks(keyword: String): Flow<List<Task>> {
        return taskDao.observeSearchTasks(keyword, SEARCH_TASK_LIMIT).map { tasks -> tasks.map { it.toDomain() } }
    }

    suspend fun getTask(localId: String): Task? {
        return taskDao.getByLocalId(localId)?.toDomain()
    }

    suspend fun exportBackupTasks(): List<Task> {
        return taskDao.getBackupTasks(BACKUP_EXPORT_LIMIT).map { it.toDomain() }
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
        val task = TaskEntity(
            localId = localId,
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
            createdAt = now,
            updatedAt = now,
            lastSyncAt = null,
        )
        taskDao.upsert(task)
        replaceQueue(task, "create")
        return localId
    }

    suspend fun importBackupJson(raw: String): Int {
        if (raw.length > MAX_IMPORT_BYTES) return 0
        val root = runCatching { JsonParser.parseString(raw).asJsonObject }.getOrNull() ?: return 0
        val tasks = root.getAsJsonArray("tasks") ?: return 0
        var imported = 0
        tasks.forEach { element ->
            if (imported >= MAX_IMPORT_TASKS) return@forEach
            val item = element.asJsonObjectOrNull() ?: return@forEach
            val title = item.stringOrNull("title")?.trim().orEmpty()
            if (title.isBlank()) return@forEach
            val now = Instant.now().toString()
            val task = TaskEntity(
                localId = "import-${UUID.randomUUID()}",
                serverId = null,
                title = title,
                content = item.stringOrNull("content"),
                status = item.stringOrNull("status")?.takeIf { it == TaskStatus.Completed.wireName }
                    ?: TaskStatus.Todo.wireName,
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
                checklistJson = item.get("checklistJson")?.takeIf { !it.isJsonNull }?.asString
                    ?: item.get("checklist")?.toString()
                    ?: "[]",
                isTemplate = item.booleanOrNull("isTemplate") ?: item.booleanOrNull("is_template") ?: false,
                templateName = item.stringOrNull("templateName") ?: item.stringOrNull("template_name"),
                sortOrder = item.intOrNull("sortOrder") ?: item.intOrNull("sort_order") ?: 0,
                version = 0,
                isDeleted = false,
                syncStatus = SyncStatus.PendingCreate.wireName,
                createdAt = now,
                updatedAt = now,
                lastSyncAt = null,
            )
            taskDao.upsert(task)
            replaceQueue(task, "create")
            imported += 1
        }
        return imported
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
        listType: String? = null,
        plannedDate: String? = null,
        snoozedUntil: String? = null,
    ) {
        val current = taskDao.getByLocalId(localId) ?: return
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
            project = project ?: current.project,
            listType = listType ?: current.listType,
            dueTime = dueTime,
            remindTime = remindTime,
            repeatRule = repeatRule,
            plannedDate = plannedDate ?: current.plannedDate,
            snoozedUntil = snoozedUntil ?: current.snoozedUntil,
            syncStatus = syncStatus.wireName,
            updatedAt = now,
        )
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun completeTask(localId: String) {
        val current = taskDao.getByLocalId(localId) ?: return
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
        val current = taskDao.getByLocalId(localId) ?: return
        taskDao.upsert(
            current.copy(
                syncStatus = SyncStatus.Synced.wireName,
                updatedAt = Instant.now().toString(),
            ),
        )
        syncQueueDao.deleteByLocalId(localId)
    }

    suspend fun forceOverwriteServer(localId: String) {
        val current = taskDao.getByLocalId(localId) ?: return
        val updated = current.copy(
            syncStatus = if (current.serverId == null) {
                SyncStatus.PendingCreate.wireName
            } else {
                SyncStatus.PendingUpdate.wireName
            },
            updatedAt = Instant.now().toString(),
        )
        taskDao.upsert(updated)
        replaceQueue(updated, if (current.serverId == null) "create" else "update")
    }

    suspend fun batchComplete(taskIds: List<String>) {
        taskIds.distinct().forEach { completeTask(it) }
    }

    suspend fun batchDelete(taskIds: List<String>) {
        taskIds.distinct().forEach { softDeleteTask(it) }
    }

    suspend fun undoCompleteTask(localId: String) {
        val current = taskDao.getByLocalId(localId) ?: return
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

    suspend fun postponeTask(localId: String, dueTime: String?, remindTime: String?, plannedDate: String?) {
        val current = taskDao.getByLocalId(localId) ?: return
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
        val current = taskDao.getByLocalId(localId) ?: return
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
        val current = taskDao.getByLocalId(localId) ?: return
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
        val current = taskDao.getByLocalId(localId) ?: return
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
        val current = taskDao.getByLocalId(localId) ?: return
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
        val current = taskDao.getByLocalId(localId) ?: return
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
        val current = taskDao.getByLocalId(localId) ?: return
        val checklist = parseChecklist(current.checklistJson).map { item ->
            if (item.id == itemId) item.copy(done = !item.done) else item
        }
        updateChecklist(current, checklist)
    }

    suspend fun deleteChecklistItem(localId: String, itemId: String) {
        val current = taskDao.getByLocalId(localId) ?: return
        val checklist = parseChecklist(current.checklistJson).filterNot { it.id == itemId }
        updateChecklist(current, checklist)
    }

    suspend fun instantiateTemplate(localId: String): String? {
        val template = taskDao.getByLocalId(localId) ?: return null
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
        val current = taskDao.getByLocalId(localId) ?: return null
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

    private suspend fun replaceQueue(task: TaskEntity, action: String) {
        syncQueueDao.deleteByLocalId(task.localId)
        syncQueueDao.enqueue(
            SyncQueueEntity(
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
