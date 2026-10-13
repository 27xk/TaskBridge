package com.taskbridge.app.ui.task

import com.taskbridge.app.domain.model.TaskFilter
import com.taskbridge.app.domain.model.TaskListPage
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class TaskListPagerTest {
    @Test
    fun switchingViewsCancelsTheOldQueryAndLeavingTheScreenReleasesIt() = runTest {
        val active = mutableSetOf<TaskFilter>()
        val pager = TaskListPager(backgroundScope, flowOf("Asia/Shanghai"), flowOf(Instant.EPOCH)) { query ->
            flow {
                active += query.filter
                try {
                    emit(TaskListPage())
                    awaitCancellation()
                } finally {
                    active -= query.filter
                }
            }
        }
        val subscription = backgroundScope.launch { pager.page.collect {} }
        runCurrent()
        assertEquals(setOf(TaskFilter.All), active)
        pager.select(todayOnly = false, filter = TaskFilter.Trash, keyword = "")
        runCurrent()
        assertEquals(setOf(TaskFilter.Trash), active)
        subscription.cancel()
        runCurrent()
        assertEquals(emptySet<TaskFilter>(), active)
    }
}
