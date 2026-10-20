package com.taskbridge.app

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeLanguageProvider
import com.taskbridge.app.ui.i18n.stringsFor
import com.taskbridge.app.ui.task.TaskHomeIcon
import com.taskbridge.app.ui.task.TaskHomeHeader
import com.taskbridge.app.ui.task.TaskHomeScaffold
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class TaskHomeNavigationUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun phoneNavigationFloatsWithoutMovingTabs() = verifyNavigation(wide = false, dark = false)
    @Test fun darkPhoneNavigationFloatsWithoutMovingTabs() = verifyNavigation(wide = false, dark = true)
    @Test fun tabletRailKeepsDestinationsReachable() = verifyNavigation(wide = true, dark = false)
    @Test fun largeTextKeepsAllDestinationsReachable() = verifyNavigation(wide = false, dark = true, fontScale = 1.6f)

    @Test
    fun narrowLargeTextKeepsHeaderHeightAcrossPages() {
        var settings by mutableStateOf(false)
        val strings = stringsFor(AppLanguage.Chinese)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                MaterialTheme {
                    TaskBridgeLanguageProvider(AppLanguage.Chinese) {
                        Box(Modifier.requiredSize(320.dp, 320.dp)) {
                            TaskHomeHeader(
                                title = if (settings) strings.settings else strings.todayTasks,
                                dateLabel = "", subtitle = "Header details",
                                actions = {
                                    TextButton(onClick = {}) {
                                        if (!settings) TaskHomeIcon(TaskHomeIcon.Sync, null)
                                        Text(if (settings) strings.back else strings.syncNow,
                                            Modifier.padding(start = if (settings) 0.dp else 6.dp))
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
        val before = compose.onNodeWithTag("home-header").getUnclippedBoundsInRoot()
        compose.runOnIdle { settings = true }
        assertEquals(before, compose.onNodeWithTag("home-header").getUnclippedBoundsInRoot())
    }

    @Test
    fun realScreensKeepNavigationAndHeaderStableWithDirectSync(): Unit = runBlocking {
        val application = ApplicationProvider.getApplicationContext<TaskBridgeApplication>()
        val container = application.container
        val tokens = container.tokenDataStore
        val oldApi = tokens.apiBaseUrl.first()
        val oldSocket = tokens.webSocketUrl.first()
        tokens.saveNetworkEndpoints("http://127.0.0.1:9/api/v1/", "ws://127.0.0.1:9/ws/sync")
        tokens.saveTokens("synthetic-navigation-ui", "synthetic-navigation-refresh", userId = 987654325)
        val strings = stringsFor(AppLanguage.Chinese)
        try {
            ActivityScenario.launch(MainActivity::class.java).use {
                compose.waitUntil(10_000) { compose.onAllNodes(androidx.compose.ui.test.hasTestTag("home-sync-now")).fetchSemanticsNodes().isNotEmpty() }
                compose.onNodeWithText(strings.syncNow).assertIsDisplayed().performClick()
                val navigation = compose.onNodeWithTag("home-navigation").getUnclippedBoundsInRoot()
                val header = compose.onNodeWithTag("home-header").getUnclippedBoundsInRoot()
                saveScreen("today")
                compose.onNodeWithTag("home-nav-settings").performClick().assertIsSelected()
                compose.onNodeWithTag("home-add-task").assertDoesNotExist()
                assertEquals(navigation, compose.onNodeWithTag("home-navigation").getUnclippedBoundsInRoot())
                assertEquals(header, compose.onNodeWithTag("home-header").getUnclippedBoundsInRoot())
                saveScreen("settings")
                compose.onNodeWithContentDescription("设置分类: 偏好").performClick()
                compose.onNodeWithText("连接").performClick()
                compose.onNodeWithTag("home-nav-today").performClick().assertIsSelected()
                compose.onNodeWithTag("home-nav-settings").performClick().assertIsSelected()
                compose.onNodeWithContentDescription("设置分类: 连接").assertIsDisplayed()
                compose.onNodeWithTag("home-nav-all").performClick().assertIsSelected()
                compose.onNodeWithText(strings.syncNow).assertIsDisplayed()
                assertEquals(navigation, compose.onNodeWithTag("home-navigation").getUnclippedBoundsInRoot())
                assertEquals(header, compose.onNodeWithTag("home-header").getUnclippedBoundsInRoot())
                saveScreen("all")
                compose.onNodeWithTag("home-nav-settings").performClick().assertIsSelected()
                compose.onNodeWithContentDescription("设置分类: 连接").performClick()
                compose.onNodeWithText("同步问题").performClick()
                compose.onNodeWithTag("home-nav-today").performClick().assertIsSelected()
                compose.onNodeWithTag("home-nav-settings").performClick().assertIsSelected()
                compose.onNodeWithContentDescription("设置分类: 同步问题").assertIsDisplayed()
                compose.onNodeWithTag("home-nav-all").performClick().assertIsSelected()
                compose.onNodeWithTag("home-nav-settings").performClick().assertIsSelected()
                compose.onNodeWithText(strings.back).performClick()
                compose.onNodeWithTag("home-nav-all").assertIsSelected()
                compose.onNodeWithTag("home-nav-today").performClick().assertIsSelected()
                // Verify real window insets with an actual IME, separate from cropped fixtures.
                compose.onNode(hasSetTextAction()).assertIsDisplayed().performClick()
                compose.waitUntil(5_000) {
                    compose.onAllNodes(androidx.compose.ui.test.hasTestTag("home-navigation")).fetchSemanticsNodes().isEmpty()
                }
                compose.onNode(hasSetTextAction()).performTextInput("Keyboard probe")
                compose.onNode(hasSetTextAction()).assertIsDisplayed()
                compose.onNodeWithTag("home-add-task").assertDoesNotExist()
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().uiAutomation.performGlobalAction(
                    android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK,
                )
                compose.waitUntil(5_000) {
                    compose.onAllNodes(androidx.compose.ui.test.hasTestTag("home-navigation")).fetchSemanticsNodes().isNotEmpty()
                }
                compose.onNodeWithTag("home-navigation").assertIsDisplayed()
                compose.onNodeWithTag("home-add-task").assertIsDisplayed()
            }
        } finally {
            tokens.clear()
            tokens.saveNetworkEndpoints(oldApi, oldSocket)
        }
    }

    private fun saveScreen(name: String) {
        val application = ApplicationProvider.getApplicationContext<TaskBridgeApplication>()
        val directory = File(application.getExternalFilesDir(null), "home-navigation").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { output ->
            compose.onRoot().captureToImage().asAndroidBitmap()
                .compress(Bitmap.CompressFormat.PNG, 100, output)
        }
    }

    private fun verifyNavigation(wide: Boolean, dark: Boolean, fontScale: Float = 1f) {
        var today by mutableStateOf(true)
        var settings by mutableStateOf(false)
        val strings = stringsFor(AppLanguage.Chinese)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density * if (wide) 0.45f else 1f, fontScale)) {
                MaterialTheme(colorScheme = if (dark) darkColorScheme() else lightColorScheme()) {
                    TaskBridgeLanguageProvider(AppLanguage.Chinese) {
                        Box(Modifier.requiredSize(if (wide) 840.dp else 360.dp, 640.dp).testTag("home-probe")) {
                            TaskHomeScaffold(
                                todaySelected = today, settingsSelected = settings, strings = strings,
                                onTodayClick = { today = true; settings = false },
                                onAllClick = { today = false; settings = false },
                                onSettingsClick = { settings = true },
                                onAddClick = if (settings) null else ({}), topBar = {},
                            ) { Text("Task content") }
                        }
                    }
                }
            }
        }
        val frame = compose.onNodeWithTag("home-probe").getUnclippedBoundsInRoot()
        val navigation = compose.onNodeWithTag("home-navigation").assertIsDisplayed().getUnclippedBoundsInRoot()
        assertTrue("Navigation must float inside the page", navigation.left >= frame.left + 12.dp)
        if (!wide) {
            assertTrue("Navigation must have a trailing margin", navigation.right <= frame.right - 12.dp)
            assertTrue("Navigation must float above the safe-area edge", navigation.bottom <= frame.bottom - 8.dp)
        }
        val before = compose.onNodeWithTag("home-nav-today").getUnclippedBoundsInRoot()
        compose.onNodeWithTag("home-nav-today").assertIsSelected()
        compose.onNodeWithTag("home-nav-all").performClick().assertIsSelected()
        assertEquals(before, compose.onNodeWithTag("home-nav-today").getUnclippedBoundsInRoot())
        compose.onNodeWithTag("home-nav-settings").assertIsDisplayed().performClick().assertIsSelected()
        assertEquals(navigation, compose.onNodeWithTag("home-navigation").getUnclippedBoundsInRoot())
        assertEquals(before, compose.onNodeWithTag("home-nav-today").getUnclippedBoundsInRoot())
        compose.onNodeWithTag("home-nav-today").performClick().assertIsSelected()
        val application = ApplicationProvider.getApplicationContext<TaskBridgeApplication>()
        val directory = File(application.getExternalFilesDir(null), "home-navigation").apply { mkdirs() }
        File(directory, "navigation-${if (wide) "tablet" else "phone"}-${if (dark) "dark" else "light"}-$fontScale.png")
            .outputStream().use { output ->
                compose.onNodeWithTag("home-probe").captureToImage().asAndroidBitmap()
                    .compress(Bitmap.CompressFormat.PNG, 100, output)
            }
    }
}
