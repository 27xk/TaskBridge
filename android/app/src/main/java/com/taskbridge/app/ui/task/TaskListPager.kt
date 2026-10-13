package com.taskbridge.app.ui.task

import com.taskbridge.app.domain.model.TaskFilter
import com.taskbridge.app.domain.model.TaskListPage
import com.taskbridge.app.domain.model.TaskListQuery
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
class TaskListPager(
    scope: CoroutineScope,
    displayTimeZone: Flow<String>,
    clock: Flow<Instant>,
    load: (TaskListQuery) -> Flow<TaskListPage>,
) {
    private val selection = MutableStateFlow(TaskListQuery(now = Instant.EPOCH))

    val page = combine(
        selection.debounce { if (it.keyword.isBlank()) 0L else 250L },
        displayTimeZone.distinctUntilChanged(),
        clock,
    ) { query, zone, now -> query.copy(now = now, displayTimeZone = zone) }
        .distinctUntilChanged()
        .flatMapLatest(load)
        .stateIn(scope, SharingStarted.WhileSubscribed(stopTimeoutMillis = 0, replayExpirationMillis = 0), TaskListPage())

    fun select(todayOnly: Boolean, filter: TaskFilter, keyword: String) {
        selection.update { current ->
            if (current.todayOnly == todayOnly && current.filter == filter && current.keyword == keyword) current
            else current.copy(todayOnly = todayOnly, filter = filter, keyword = keyword, offset = 0)
        }
    }

    fun next() {
        val current = page.value
        if (current.hasNext) selection.update { it.copy(offset = current.offset + current.pageSize) }
    }

    fun previous() {
        val current = page.value
        if (current.hasPrevious) selection.update { it.copy(offset = (current.offset - current.pageSize).coerceAtLeast(0)) }
    }
}
