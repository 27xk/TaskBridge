package com.taskbridge.app.widget

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetUiContractTest {
    @Test
    fun statusActionHasA48DpTouchTarget() {
        val styles = androidSource("src/main/res/values/styles.xml")
        val statusStyle = styles.substringAfter("<style name=\"WidgetTaskStatus\">").substringBefore("</style>")

        assertTrue(statusStyle.contains("<item name=\"android:layout_width\">48dp</item>"))
        assertTrue(statusStyle.contains("<item name=\"android:layout_height\">48dp</item>"))
    }

    @Test
    fun remoteViewsExposeLocalizedStatusActionDescriptions() {
        val provider = androidSource(
            "src/main/java/com/taskbridge/app/widget/TodayTaskWidgetProvider.kt",
        )

        assertTrue(provider.contains("setContentDescription(statusIds[index]"))
        assertTrue(provider.contains("completeTaskDescription"))
        assertTrue(provider.contains("openCompletedTaskDescription"))
    }

    @Test
    fun widgetShowsOverflowAndKeepsTransparentTextReadable() {
        val repository = androidSource(
            "src/main/java/com/taskbridge/app/widget/TodayTaskWidgetRepository.kt",
        )
        val provider = androidSource(
            "src/main/java/com/taskbridge/app/widget/TodayTaskWidgetProvider.kt",
        )
        val layout = androidSource("src/main/res/layout/widget_today_task.xml")

        assertTrue(repository.contains("val hasMoreTasks: Boolean"))
        assertTrue(repository.contains("hasMoreTasks = filteredCandidates.size > WidgetConstants.MAX_TASKS"))
        assertTrue(repository.contains("if (workspace == null)"))
        assertTrue(!repository.contains("accessToken.isNullOrBlank() || workspace == null"))
        assertTrue(layout.contains("@+id/widgetMoreTasks"))
        assertTrue(provider.contains("state.hasMoreTasks"))
        assertTrue(provider.contains("state.copy.moreTasks"))
        assertTrue(provider.contains("R.drawable.widget_background_dark"))
    }

    @Test
    fun widgetOpacityHasAReadableMinimum() {
        val tokenStore = androidSource(
            "src/main/java/com/taskbridge/app/data/datastore/TokenDataStore.kt",
        )
        val settings = androidSource(
            "src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt",
        )
        val provider = androidSource(
            "src/main/java/com/taskbridge/app/widget/TodayTaskWidgetProvider.kt",
        )

        assertTrue(tokenStore.contains("coerceIn(60, 100)"))
        assertTrue(settings.contains("valueRange = 60f..100f"))
        assertTrue(provider.contains("coerceIn(60, 100)"))
    }

    private fun androidSource(relativePath: String): String {
        val start = File(checkNotNull(System.getProperty("user.dir"))).absoluteFile
        val file = generateSequence(start) { it.parentFile }
            .flatMap { directory ->
                sequenceOf(
                    File(directory, relativePath),
                    File(directory, "app/$relativePath"),
                    File(directory, "android/app/$relativePath"),
                )
            }
            .firstOrNull(File::isFile)
            ?: error("Unable to locate $relativePath from $start")
        return file.readText(Charsets.UTF_8)
    }
}
