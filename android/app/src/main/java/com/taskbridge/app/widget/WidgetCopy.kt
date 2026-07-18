package com.taskbridge.app.widget

import com.taskbridge.app.ui.i18n.AppLanguage

data class WidgetCopy(
    val signInRequired: String,
    val emptyToday: String,
    val emptyAll: String,
    val overduePrefix: String,
    val today: String,
    val noDueTime: String,
    val completed: String,
    val moreTasks: String,
    private val completeTaskPrefix: String,
    private val openCompletedTaskPrefix: String,
) {
    fun completeTaskDescription(title: String): String = completeTaskPrefix + title

    fun openCompletedTaskDescription(title: String): String = openCompletedTaskPrefix + title
}

fun widgetCopy(language: AppLanguage): WidgetCopy {
    return if (language == AppLanguage.English) {
        WidgetCopy(
            signInRequired = "Sign in to TaskBridge",
            emptyToday = "No tasks today",
            emptyAll = "No tasks",
            overduePrefix = "Overdue ",
            today = "Today",
            noDueTime = "No due time",
            completed = "Completed",
            moreTasks = "More tasks available. Open TaskBridge to view all.",
            completeTaskPrefix = "Complete task: ",
            openCompletedTaskPrefix = "Open completed task: ",
        )
    } else {
        WidgetCopy(
            signInRequired = "\u8BF7\u767B\u5F55 TaskBridge",
            emptyToday = "\u4ECA\u5929\u6682\u65E0\u5F85\u529E",
            emptyAll = "\u6682\u65E0\u4EFB\u52A1",
            overduePrefix = "\u903E\u671F ",
            today = "\u4ECA\u5929",
            noDueTime = "\u65E0\u622A\u6B62\u65F6\u95F4",
            completed = "\u5DF2\u5B8C\u6210",
            moreTasks = "还有更多任务，打开 TaskBridge 查看全部",
            completeTaskPrefix = "\u5B8C\u6210\u4EFB\u52A1\uFF1A",
            openCompletedTaskPrefix = "\u6253\u5F00\u5DF2\u5B8C\u6210\u4EFB\u52A1\uFF1A",
        )
    }
}
