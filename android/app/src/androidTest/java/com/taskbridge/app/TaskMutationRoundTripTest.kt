package com.taskbridge.app

import android.app.PendingIntent
import android.app.Notification
import android.app.NotificationManager
import android.Manifest
import android.content.Intent
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.local.TaskListDataSource
import com.taskbridge.app.data.local.WorkspaceMigrationCoordinator
import com.taskbridge.app.data.remote.RetrofitClient
import com.taskbridge.app.data.remote.ApiService
import com.taskbridge.app.data.remote.dto.ApiEnvelope
import com.taskbridge.app.data.remote.dto.SyncPullResponseDto
import com.taskbridge.app.data.remote.dto.SyncPushRequestDto
import com.taskbridge.app.data.remote.dto.SyncPushResponseDto
import com.taskbridge.app.data.remote.dto.SyncChangeResultDto
import com.taskbridge.app.data.remote.dto.TaskDto
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.TaskListQuery
import com.taskbridge.app.notification.ReminderReceiver
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.widget.TodayTaskWidgetRepository
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import com.google.gson.Gson
import com.google.gson.JsonParser
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.lang.reflect.Proxy
import java.util.concurrent.atomic.AtomicBoolean

/** Uses a synthetic offline workspace and an isolated Room database, never a remote account. */
@RunWith(AndroidJUnit4::class)
class TaskMutationRoundTripTest {
    private lateinit var database: AppDatabase
    private lateinit var repository: TaskRepository
    private val application get() = ApplicationProvider.getApplicationContext<TaskBridgeApplication>()
    private val tokens get() = application.container.tokenDataStore
    private lateinit var oldApi: String
    private lateinit var oldSocket: String
    private val changes = mutableListOf<Set<String>>()
    private val body = "完整正文 with full details\n".repeat(500)
    private val checklist = "[{\"id\":\"child\",\"title\":\"保留清单\",\"done\":false}]"

    @Before
    fun setUp() = runBlocking {
        oldApi = tokens.apiBaseUrl.first()
        oldSocket = tokens.webSocketUrl.first()
        tokens.saveNetworkEndpoints("http://127.0.0.1:9/api/v1/", "ws://127.0.0.1:9/ws/sync")
        tokens.saveTokens("synthetic-test", "synthetic-refresh", userId = 987654321)
        tokens.expireSession()
        database = Room.inMemoryDatabaseBuilder(application, AppDatabase::class.java).build()
        repository = TaskRepository(
            RetrofitClient.create(application, tokens), database, database.taskDao(), database.syncQueueDao(), tokens,
            onTasksChanged = { _, ids -> changes += ids },
        )
    }

    @After
    fun tearDown() = runBlocking {
        database.close()
        tokens.clear()
        tokens.saveNetworkEndpoints(oldApi, oldSocket)
    }

    @Test
    fun listActionsNeverSaveOmittedBodyOrChecklistFields() = runBlocking {
        val id = addTask("Original")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        val pageTask = TaskListDataSource(database).observe(workspace.id, TaskListQuery()).first().tasks.single()
        assertNull(pageTask.content)
        assertEquals("[]", pageTask.checklistJson)

        repository.completeTask(pageTask.localId)
        assertFullRecord(id)
        repository.undoCompleteTask(pageTask.localId)
        assertFullRecord(id)
        repository.softDeleteTask(pageTask.localId)
        assertFullRecord(id)
        repository.restoreDeletedTask(pageTask.localId)
        assertFullRecord(id)
        repository.postponeTask(pageTask.localId, "2030-01-02T09:00:00Z", null, "2030-01-02")
        assertFullRecord(id)
        repository.snoozeTask(pageTask.localId, "2030-01-03T09:00:00Z")
        assertFullRecord(id)
        repository.planTaskForToday(pageTask.localId, "2030-01-01")
        assertFullRecord(id)
        repository.moveTaskToInbox(pageTask.localId)
        assertFullRecord(id)
        val full = checkNotNull(repository.getTask(id))
        repository.updateTask(id, full.title, full.content, 5, full.tag, full.dueTime, full.remindTime, full.repeatRule)
        assertFullRecord(id)
        assertEquals(5, repository.getTask(id)?.priority)

        val instance = checkNotNull(repository.instantiateTemplate(id))
        assertFullRecord(instance)
        assertEquals(false, repository.getTask(instance)?.isTemplate)
    }

    @Test
    fun batchActionsPublishOneCommittedChangeSetAndKeepFullRecords() = runBlocking {
        val ids = listOf(addTask("one"), addTask("two"))
        changes.clear()
        repository.batchComplete(ids)
        assertEquals(listOf(ids.toSet()), changes)
        ids.forEach { assertFullRecord(it) }
        changes.clear()
        repository.batchDelete(ids)
        assertEquals(listOf(ids.toSet()), changes)
        ids.forEach { assertFullRecord(it) }
        changes.clear()
        repository.batchRestoreDeleted(ids)
        assertEquals(listOf(ids.toSet()), changes)
        ids.forEach { assertFullRecord(it) }
    }

    @Test
    fun syncCursorChangesDoNotRestartTheVisibleTaskQuery() = runBlocking {
        val id = addTask("visible")
        val pages = Channel<Int>(Channel.UNLIMITED)
        val collection = launch(Dispatchers.IO) {
            repository.observeTaskPage(TaskListQuery()).collect { pages.send(it.completed) }
        }
        try {
            assertEquals(0, withTimeout(5_000) { pages.receive() })
            tokens.saveLastSyncTime("2030-01-01T00:00:00Z")
            assertNull(withTimeoutOrNull(400) { pages.receive() })
            repository.completeTask(id)
            assertEquals(1, withTimeout(5_000) { pages.receive() })
        } finally {
            collection.cancelAndJoin()
            pages.close()
        }
    }

    @Test
    fun syncOnlyPublishesActualTaskChangesIncludingRemoteCompletionAndDeletion() = runBlocking {
        var remote = Gson().fromJson(
            """{"id":10,"user_id":987654321,"title":"remote","content":"full body","status":"todo","priority":2,"version":1,"is_deleted":false,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}""",
            TaskDto::class.java,
        )
        var serverTime = "2026-10-10T00:00:00Z"
        val api = Proxy.newProxyInstance(ApiService::class.java.classLoader, arrayOf(ApiService::class.java)) { _, method, _ ->
            when (method.name) {
                "registerDevice" -> ApiEnvelope<Any>(0, "ok", null)
                "pullSync" -> ApiEnvelope(0, "ok", SyncPullResponseDto(
                    changedTasks = if (remote.isDeleted) emptyList() else listOf(remote),
                    deletedTasks = if (remote.isDeleted) listOf(remote) else emptyList(),
                    serverTime = serverTime,
                ))
                else -> error("Unexpected API call: ${method.name}")
            }
        } as ApiService
        val sync = SyncRepository(api, database, database.taskDao(), database.syncQueueDao(), tokens, onTasksChanged = { _, ids -> changes += ids.toSet() })
        val first = sync.syncNow("test-device").getOrThrow()
        assertEquals(1, first.localIds.size)
        changes.clear()
        serverTime = "2026-10-10T00:01:00Z"
        assertEquals(emptySet<String>(), sync.syncNow("test-device").getOrThrow().localIds)
        assertEquals(emptyList<Set<String>>(), changes)
        remote = remote.copy(status = "completed", completedAt = serverTime, updatedAt = serverTime, version = 2)
        assertEquals(first.localIds, sync.syncNow("test-device").getOrThrow().localIds)
        assertEquals(listOf(first.localIds), changes)
        changes.clear()
        remote = remote.copy(isDeleted = true, version = 3)
        assertEquals(first.localIds, sync.syncNow("test-device").getOrThrow().localIds)
        assertEquals(listOf(first.localIds), changes)
    }

    @Test
    fun pushAcknowledgementKeepsTheEditMadeWhileCreatingATask() = runBlocking {
        assertPushKeepsNewerMutation(delete = false, includeResponseTask = true)
    }

    @Test
    fun pushAcknowledgementWithoutATaskKeepsTheNewerEditPending() = runBlocking {
        assertPushKeepsNewerMutation(delete = false, includeResponseTask = false)
    }

    @Test
    fun pushAcknowledgementKeepsDeletionMadeWhileCreatingATask() = runBlocking {
        assertPushKeepsNewerMutation(delete = true, includeResponseTask = true)
    }

    @Test
    fun editSnapshotReadBeforeAcknowledgementKeepsTheAcknowledgedServerIdentity() = runBlocking {
        val id = addTask("Before request")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        val pushCaptured = CompletableDeferred<Unit>()
        val allowPush = CompletableDeferred<Unit>()
        val editCaptured = CompletableDeferred<Unit>()
        val allowEdit = CompletableDeferred<Unit>()
        val pauseEdit = AtomicBoolean(true)
        val actualDao = database.taskDao()
        val gatedDao = object : TaskDao by actualDao {
            override suspend fun getByLocalId(workspaceId: String, localId: String): TaskEntity? {
                val snapshot = actualDao.getByLocalId(workspaceId, localId)
                if (localId == id && pauseEdit.compareAndSet(true, false)) {
                    editCaptured.complete(Unit)
                    allowEdit.await()
                }
                return snapshot
            }
        }
        var pushes = 0
        var remote: TaskDto? = null
        val api = Proxy.newProxyInstance(ApiService::class.java.classLoader, arrayOf(ApiService::class.java)) { _, method, args ->
            when (method.name) {
                "registerDevice" -> ApiEnvelope<Any>(0, "ok", null)
                "pushSync" -> {
                    val sent = (args!![0] as SyncPushRequestDto).changes.single()
                    runBlocking { pushCaptured.complete(Unit); allowPush.await() }
                    remote = Gson().fromJson(
                        """{"id":10,"user_id":987654321,"title":"server","status":"todo","priority":2,"version":1,"is_deleted":false,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-10-10T00:00:00Z"}""",
                        TaskDto::class.java,
                    ).copy(title = sent.title!!, content = sent.content, version = ++pushes)
                    ApiEnvelope(0, "ok", SyncPushResponseDto(listOf(SyncChangeResultDto(
                        localId = id, serverId = 10, action = sent.action, status = "applied", version = pushes,
                        message = null, task = remote, serverTask = null,
                    )), "2026-10-10T00:00:00Z"))
                }
                "pullSync" -> ApiEnvelope(0, "ok", SyncPullResponseDto(listOf(checkNotNull(remote)), emptyList(), "2026-10-10T00:00:00Z"))
                else -> error("Unexpected API call: ${method.name}")
            }
        } as ApiService
        val lateEditor = TaskRepository(api, database, gatedDao, database.syncQueueDao(), tokens)
        val sync = SyncRepository(api, database, actualDao, database.syncQueueDao(), tokens)
        try {
            withTimeout(10_000) {
                val syncing = async(Dispatchers.IO) { sync.syncNow("test-device").getOrThrow() }
                pushCaptured.await()
                val editing = async(Dispatchers.IO) {
                    lateEditor.updateTask(id, "Edited from older snapshot", body + "new text", 5, null, null, null, "daily")
                }
                editCaptured.await()
                allowPush.complete(Unit)
                syncing.await()
                assertEquals(10, actualDao.getByLocalId(workspace.id, id)?.serverId)
                allowEdit.complete(Unit)
                editing.await()
                val current = checkNotNull(actualDao.getByLocalId(workspace.id, id))
                assertEquals("Edited from older snapshot", current.title)
                assertEquals(body + "new text", current.content)
                assertEquals(10, current.serverId)
                assertEquals(1, current.version)
                assertEquals("pending_update", current.syncStatus)
                val pending = database.syncQueueDao().pendingChanges(workspace.id, 100).single()
                assertEquals(10, pending.serverId)
                assertEquals(1, pending.version)
                assertEquals("update", pending.action)
                sync.syncNow("test-device").getOrThrow()
                assertEquals("Edited from older snapshot", repository.getTask(id)?.title)
                assertEquals(0, database.syncQueueDao().queueCounts(workspace.id).total)
            }
        } finally {
            allowPush.complete(Unit)
            allowEdit.complete(Unit)
        }
    }

    @Test
    fun todayWidgetIncludesExplicitTodayTasksWithoutDatesAndExcludesUnscheduledInbox() = runBlocking {
        val oldScope = tokens.widgetTaskScope.first()
        val oldCompletionScope = tokens.widgetCompletionScope.first()
        try {
            tokens.saveWidgetTaskScope(WidgetConstants.TASK_SCOPE_TODAY)
            tokens.saveWidgetCompletionScope(WidgetConstants.COMPLETION_SCOPE_OPEN)
            val todayId = repository.addTask("Undated today", null, 0, null, null, null, null, listType = "today")
            repository.addTask("Unscheduled inbox", null, 0, null, null, null, null)
            val widget = TodayTaskWidgetRepository(database, tokens, WorkspaceMigrationCoordinator(
                database, database.taskDao(), database.syncQueueDao(), tokens,
            ))
            assertEquals(listOf(todayId), widget.loadState().tasks.map { it.localId })
        } finally {
            tokens.saveWidgetTaskScope(oldScope)
            tokens.saveWidgetCompletionScope(oldCompletionScope)
        }
    }

    @Test
    fun editSnapshotCannotRestoreATaskDeletedWhileTheEditWasPending() = runBlocking {
        val id = addTask("Before delete")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        val dao = database.taskDao()
        dao.upsert(checkNotNull(dao.getByLocalId(workspace.id, id)).copy(serverId = 10, version = 1))
        withPausedEdit(id) { repository.softDeleteTask(id) }
        val current = checkNotNull(dao.getByLocalId(workspace.id, id))
        assertEquals(true, current.isDeleted)
        assertEquals("pending_delete", current.syncStatus)
        val pending = database.syncQueueDao().pendingChanges(workspace.id, 100).single()
        assertEquals("delete", pending.action)
        assertEquals(10, pending.serverId)
    }

    @Test
    fun editSnapshotCannotRecreateATaskPurgedWhileTheEditWasPending() = runBlocking {
        val id = addTask("Before purge")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        withPausedEdit(id) {
            repository.softDeleteTask(id)
            repository.purgeDeletedTask(id)
        }
        assertEquals(null, database.taskDao().getByLocalId(workspace.id, id)?.localId)
        assertEquals(0, database.syncQueueDao().queueCounts(workspace.id).total)
    }

    @Test
    fun editSnapshotNeverRebasesAgainstAnotherWorkspace() = runBlocking {
        val id = addTask("Original workspace")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        val dao = database.taskDao()
        val original = checkNotNull(dao.getByLocalId(workspace.id, id))
        var otherWorkspaceId = ""
        withPausedEdit(id) {
            tokens.saveTokens("other-test", "other-refresh", userId = 987654322)
            tokens.expireSession()
            val other = checkNotNull(tokens.currentWorkspace.first())
            otherWorkspaceId = other.id
            dao.upsert(original.copy(localId = "$id-other", workspaceId = other.id, ownerUserId = other.userId, title = "Other workspace", serverId = 77, version = 4))
        }
        val current = checkNotNull(dao.getByLocalId(workspace.id, id))
        assertEquals("Edited from delayed snapshot", current.title)
        assertNull(current.serverId)
        val other = checkNotNull(dao.getByLocalId(otherWorkspaceId, "$id-other"))
        assertEquals("Other workspace", other.title)
        assertEquals(77, other.serverId)
        assertEquals(4, other.version)
        assertEquals(0, database.syncQueueDao().queueCounts(otherWorkspaceId).total)
    }

    private suspend fun withPausedEdit(id: String, meanwhile: suspend () -> Unit) = kotlinx.coroutines.coroutineScope {
        val editCaptured = CompletableDeferred<Unit>()
        val allowEdit = CompletableDeferred<Unit>()
        val pauseEdit = AtomicBoolean(true)
        val actualDao = database.taskDao()
        val gatedDao = object : TaskDao by actualDao {
            override suspend fun getByLocalId(workspaceId: String, localId: String): TaskEntity? {
                val snapshot = actualDao.getByLocalId(workspaceId, localId)
                if (localId == id && pauseEdit.compareAndSet(true, false)) {
                    editCaptured.complete(Unit)
                    allowEdit.await()
                }
                return snapshot
            }
        }
        val editor = TaskRepository(RetrofitClient.create(application, tokens), database, gatedDao, database.syncQueueDao(), tokens)
        try {
            withTimeout(10_000) {
                val editing = async(Dispatchers.IO) {
                    editor.updateTask(id, "Edited from delayed snapshot", body, 5, null, null, null, null)
                }
                editCaptured.await()
                meanwhile()
                allowEdit.complete(Unit)
                editing.await()
            }
        } finally {
            allowEdit.complete(Unit)
        }
    }

    private suspend fun assertPushKeepsNewerMutation(delete: Boolean, includeResponseTask: Boolean) {
        val id = addTask("Before request")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        var pushes = 0
        var remote: TaskDto? = null
        val api = Proxy.newProxyInstance(ApiService::class.java.classLoader, arrayOf(ApiService::class.java)) { _, method, args ->
            when (method.name) {
                "registerDevice" -> ApiEnvelope<Any>(0, "ok", null)
                "pushSync" -> {
                    val sent = (args!![0] as SyncPushRequestDto).changes.single()
                    if (pushes++ == 0) runBlocking {
                        if (delete) repository.softDeleteTask(id) else {
                            repository.updateTask(id, "Edited during request", body + "new text", 5, "new tag", null, null, "daily")
                        }
                    }
                    remote = Gson().fromJson(
                        """{"id":10,"user_id":987654321,"title":"server","status":"todo","priority":2,"version":1,"is_deleted":false,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-10-10T00:00:00Z"}""",
                        TaskDto::class.java,
                    ).copy(title = sent.title!!, content = sent.content, status = sent.status ?: "todo",
                        version = pushes, isDeleted = sent.action == "delete", checklist = sent.checklist,
                        tag = sent.tag, project = sent.project, repeatRule = sent.repeatRule)
                    ApiEnvelope(0, "ok", SyncPushResponseDto(listOf(SyncChangeResultDto(
                        localId = id, serverId = 10, action = sent.action, status = "applied", version = pushes,
                        message = null, task = if (includeResponseTask) remote else null, serverTask = null,
                    )), "2026-10-10T00:00:00Z"))
                }
                "pullSync" -> ApiEnvelope(0, "ok", SyncPullResponseDto(listOf(checkNotNull(remote)), emptyList(), "2026-10-10T00:00:00Z"))
                else -> error("Unexpected API call: ${method.name}")
            }
        } as ApiService
        val sync = SyncRepository(api, database, database.taskDao(), database.syncQueueDao(), tokens)
        sync.syncNow("test-device").getOrThrow()
        val current = checkNotNull(repository.getTask(id))
        assertEquals(if (delete) "Before request" else "Edited during request", current.title)
        assertEquals(if (delete) body else body + "new text", current.content)
        assertEquals(delete, current.isDeleted)
        assertEquals(if (delete) "pending_delete" else "pending_update", current.syncStatus.wireName)
        val pending = database.syncQueueDao().pendingChanges(workspace.id, 100).single()
        assertEquals(10, pending.serverId)
        assertEquals(1, pending.version)
        assertEquals(if (delete) "delete" else "update", pending.action)
        sync.syncNow("test-device").getOrThrow()
        assertEquals(current.title, repository.getTask(id)?.title)
        assertEquals(current.content, repository.getTask(id)?.content)
        assertEquals(delete, repository.getTask(id)?.isDeleted)
        assertEquals("synced", repository.getTask(id)?.syncStatus?.wireName)
        assertEquals(0, database.syncQueueDao().queueCounts(workspace.id).total)
    }

    @Test
    fun actualAlarmsFollowCompletionUndoAndWorkspaceChanges() = runBlocking {
        val live = application.container.taskRepository
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        val id = live.addTask("Synthetic reminder", null, 0, null, "2030-01-01T09:00:00Z", null, null)
        fun alarm() = PendingIntent.getBroadcast(
            application, "${workspace.id}|$id".hashCode(), Intent(application, ReminderReceiver::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )
        try {
            assertNotNull(alarm())
            live.completeTask(id)
            assertNull(alarm())
            live.undoCompleteTask(id)
            assertNotNull(alarm())
            tokens.saveDisplayTimeZone("America/New_York")
            application.container.reminderManager.rebuildAll()
            assertNotNull(alarm())
            tokens.saveTokens("synthetic-other", "synthetic-other-refresh", userId = 987654322)
            tokens.expireSession()
            application.container.reminderManager.rebuildAll()
            assertNull(alarm())
        } finally {
            tokens.saveTokens("synthetic-test", "synthetic-refresh", userId = 987654321)
            tokens.expireSession()
            live.purgeDeletedTask(id)
        }
    }

    @Test
    fun notificationChannelsAndFallbackMessagesUseActualChineseAndEnglishCopy() = runBlocking {
        val live = application.container.taskRepository
        val reminders = application.container.reminderManager
        val notificationManager = application.getSystemService(NotificationManager::class.java)
        val previousLanguage = tokens.language.first()
        InstrumentationRegistry.getInstrumentation().uiAutomation.grantRuntimePermission(
            application.packageName, Manifest.permission.POST_NOTIFICATIONS,
        )
        val id = live.addTask("Synthetic localized reminder", null, 0, null, null, null, null)
        val task = checkNotNull(live.getTask(id))
        suspend fun notificationText(expected: String): String = withTimeout(5_000) {
            while (true) {
                val value = notificationManager.activeNotifications.firstOrNull { it.id == id.hashCode() }
                    ?.notification?.extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
                if (value == expected) return@withTimeout value
                delay(25)
            }
            @Suppress("UNREACHABLE_CODE")
            error("unreachable")
        }
        try {
            tokens.saveLanguage("zh-CN")
            reminders.ensureChannel()
            val chineseChannel = notificationManager.getNotificationChannel(ReminderManager.CHANNEL_ID)
            assertEquals("任务提醒", chineseChannel.name.toString())
            assertEquals("到期任务通知", chineseChannel.description)
            reminders.showReminder(task)
            assertEquals("任务提醒", notificationText("任务提醒"))

            tokens.saveLanguage("en-US")
            reminders.ensureChannel()
            val englishChannel = notificationManager.getNotificationChannel(ReminderManager.CHANNEL_ID)
            assertEquals("Reminders", englishChannel.name.toString())
            assertEquals("Due task notifications", englishChannel.description)
            reminders.showReminder(task)
            assertEquals("Reminder", notificationText("Reminder"))
        } finally {
            notificationManager.cancel(id.hashCode())
            live.purgeDeletedTask(id)
            tokens.saveLanguage(previousLanguage)
            reminders.ensureChannel()
        }
    }

    private suspend fun addTask(title: String) = repository.addTask(
        title = title, content = body, priority = 4, tag = "完整标签", project = "Project",
        dueTime = "2030-01-01T09:00:00Z", remindTime = "2030-01-01T08:00:00Z", repeatRule = "daily",
        checklistJson = checklist, isTemplate = true, templateName = "完整模板",
    )

    private suspend fun assertFullRecord(id: String) {
        val task = checkNotNull(repository.getTask(id))
        assertEquals(body, task.content)
        assertEquals(JsonParser.parseString(checklist), JsonParser.parseString(task.checklistJson))
        assertEquals("完整标签", task.tag)
        assertEquals("Project", task.project)
        assertEquals("daily", task.repeatRule)
    }
}
