package com.taskbridge.app.widget

import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetLocalizationTest {
    @Test
    fun englishWidgetCopyCoversEmptyDueCompletionAndAccessibilityStates() {
        val copy = widgetCopy(AppLanguage.English)

        assertEquals("Sign in to TaskBridge", copy.signInRequired)
        assertEquals("No tasks today", copy.emptyToday)
        assertEquals("No tasks", copy.emptyAll)
        assertEquals("Overdue ", copy.overduePrefix)
        assertEquals("Today", copy.today)
        assertEquals("No due time", copy.noDueTime)
        assertEquals("Completed", copy.completed)
        assertEquals("Complete task: Buy milk", copy.completeTaskDescription("Buy milk"))
        assertEquals("Open completed task: Buy milk", copy.openCompletedTaskDescription("Buy milk"))
    }

    @Test
    fun chineseWidgetCopyRemainsAvailableWhenAppUsesChinese() {
        val copy = widgetCopy(AppLanguage.Chinese)

        assertEquals("请登录 TaskBridge", copy.signInRequired)
        assertEquals("今天暂无待办", copy.emptyToday)
        assertEquals("逾期 ", copy.overduePrefix)
        assertEquals("完成任务：买牛奶", copy.completeTaskDescription("买牛奶"))
    }

    @Test
    fun widgetCopyIncludesLocalizedOverflowMessage() {
        val source = androidSource("src/main/java/com/taskbridge/app/widget/WidgetCopy.kt")

        assertTrue(source.contains("val moreTasks: String"))
        assertTrue(source.contains("More tasks available. Open TaskBridge to view all."))
        assertTrue(source.contains("还有更多任务，打开 TaskBridge 查看全部"))
    }
}
