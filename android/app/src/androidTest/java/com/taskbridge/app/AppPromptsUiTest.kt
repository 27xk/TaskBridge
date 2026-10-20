package com.taskbridge.app

import android.graphics.Bitmap
import android.graphics.Rect
import android.view.View
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.taskbridge.app.ui.components.*
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeLanguageProvider
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AppPromptsUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun popconfirmAnchorsToControlAndCancelNeverSubmits() {
        var submissions = 0
        compose.setContent {
            MaterialTheme { TaskBridgeLanguageProvider(AppLanguage.Chinese) {
                val anchor = rememberPopconfirmAnchor()
                var open by remember { mutableStateOf(false) }
                Box(Modifier.fillMaxSize().padding(24.dp)) {
                    Button(onClick = { anchor.select("trigger"); open = true }, modifier = Modifier.align(Alignment.BottomEnd).popconfirmAnchor(anchor, "trigger").testTag("trigger")) { Text("删除任务") }
                }
                if (open) AppPopconfirm(
                    anchor = anchor, onDismissRequest = { open = false },
                    title = { Text("确认删除") }, text = { Text("任务将移到回收站。") },
                    confirmButton = { Button(onClick = { submissions++; open = false }) { Text("确认") } },
                    dismissButton = { TextButton(onClick = { open = false }) { Text("取消") } },
                )
            } }
        }
        compose.onNodeWithTag("trigger").performClick()
        compose.onNodeWithTag("app_popconfirm").assertIsDisplayed()
        val trigger = compose.onNodeWithTag("trigger").fetchSemanticsNode()
        val popup = compose.onNodeWithTag("app_popconfirm").fetchSemanticsNode()
        compose.runOnIdle {
            assertTrue("Bottom trigger should place confirmation above it", popup.positionOnScreen.y + popup.size.height <= trigger.positionOnScreen.y + 1)
        }
        screenshot("app_popconfirm", "popconfirm-light.png")
        compose.onNodeWithText("取消").performClick()
        compose.onNodeWithTag("app_popconfirm").assertDoesNotExist()
        assertEquals(0, submissions)
        compose.onNodeWithTag("trigger").performClick()
        compose.onNodeWithText("确认", substring = false).performClick()
        compose.onNodeWithTag("app_popconfirm").assertDoesNotExist()
        assertEquals(1, submissions)
    }

    @Test fun identicalToastCanBeShownAgainAndDismissed() {
        compose.setContent {
            MaterialTheme { TaskBridgeLanguageProvider(AppLanguage.Chinese) { AppFeedbackHost {
                var event by remember { mutableStateOf(0) }
                Button(onClick = { event++ }) { Text("保存") }
                if (event > 0) AppToast(text = "已保存", eventKey = event)
            } } }
        }
        compose.onNodeWithText("保存").performClick()
        compose.onNodeWithText("已保存").assertIsDisplayed()
        screenshot("app_toast", "toast-light.png")
        compose.onNodeWithText("关闭").performClick()
        compose.onNodeWithText("已保存").assertDoesNotExist()
        compose.onNodeWithText("保存").performClick()
        compose.onNodeWithText("已保存").assertIsDisplayed()
        compose.mainClock.advanceTimeBy(7000)
        compose.onNodeWithText("已保存").assertDoesNotExist()
    }

    @Test fun drawerLongContentScrollsAndHasExplicitCloseInDarkTheme() {
        compose.setContent {
            MaterialTheme(colorScheme = darkColorScheme()) { TaskBridgeLanguageProvider(AppLanguage.Chinese) {
                var open by remember { mutableStateOf(true) }
                if (open) AppDrawer(
                    onDismissRequest = { open = false }, title = { Text("备份预览") },
                    text = { Column { repeat(40) { Text("待导入任务 $it", Modifier.padding(vertical = 12.dp)) } } },
                    confirmButton = { Button(onClick = { open = false }) { Text("导入") } },
                )
            } }
        }
        compose.onNodeWithTag("app_drawer").assertIsDisplayed()
        compose.onNodeWithText("导入").assertIsDisplayed()
        screenshot("app_drawer", "drawer-dark.png")
        compose.onNodeWithText("待导入任务 39").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("关闭").performClick()
        compose.onNodeWithTag("app_drawer").assertDoesNotExist()
    }

    @Test fun tooltipUsesLongPressWithoutExecutingTheButton() {
        var clicks = 0
        compose.setContent { MaterialTheme {
            AppTooltip(text = "查看筛选条件") { Button(onClick = { clicks++ }) { Text("筛选") } }
        } }
        compose.onNodeWithText("筛选").performTouchInput { longClick() }
        compose.onNodeWithText("查看筛选条件").assertIsDisplayed()
        assertEquals(0, clicks)
    }


    @Test fun replacingToastConsumesThePreviousEventExactlyOnce() {
        var oldDismissed = 0
        var newDismissed = 0
        compose.setContent {
            MaterialTheme { TaskBridgeLanguageProvider(AppLanguage.English) { AppFeedbackHost {
                var first by remember { mutableStateOf(false) }
                var second by remember { mutableStateOf(false) }
                Row {
                    Button(onClick = { first = true }) { Text("First") }
                    Button(onClick = { second = true }) { Text("Second") }
                }
                if (first) AppToast("First result", onDismiss = { oldDismissed++ })
                if (second) AppToast("Second result", onDismiss = { newDismissed++ })
            } } }
        }
        compose.onNodeWithText("First").performClick()
        compose.onNodeWithText("First result").assertIsDisplayed()
        compose.onNodeWithText("Second").performClick()
        compose.onNodeWithText("Second result").assertIsDisplayed()
        compose.runOnIdle { assertEquals(1, oldDismissed); assertEquals(0, newDismissed) }
        compose.onNodeWithText("Dismiss").performClick()
        compose.runOnIdle { assertEquals(1, oldDismissed); assertEquals(1, newDismissed) }
    }


    @Test fun removingAnErrorSourceRemovesOnlyItsOwnToast() {
        compose.setContent {
            MaterialTheme { TaskBridgeLanguageProvider(AppLanguage.English) { AppFeedbackHost {
                var hasError by remember { mutableStateOf(true) }
                Button(onClick = { hasError = false }) { Text("Correct input") }
                if (hasError) AppToast("Invalid input", isError = true)
            } } }
        }
        compose.onNodeWithText("Invalid input").assertIsDisplayed()
        compose.onNodeWithText("Correct input").performClick()
        compose.onNodeWithTag("app_toast").assertDoesNotExist()
    }

    @Test fun toastStaysNearTheBottomOfTheVisibleWindowWhenKeyboardOpens() {
        var keyboardHeight = 0
        var densityValue = 1f
        lateinit var view: View
        compose.setContent {
            MaterialTheme { TaskBridgeLanguageProvider(AppLanguage.English) { AppFeedbackHost {
                view = LocalView.current
                val density = LocalDensity.current
                densityValue = density.density
                keyboardHeight = WindowInsets.ime.getBottom(density)
                val requester = remember { FocusRequester() }
                val keyboard = LocalSoftwareKeyboardController.current
                var value by remember { mutableStateOf("") }
                var show by remember { mutableStateOf(false) }
                Column {
                    OutlinedTextField(value, onValueChange = { value = it }, modifier = Modifier.focusRequester(requester).testTag("input"))
                    Button(onClick = { requester.requestFocus(); keyboard?.show(); show = true }) { Text("Show keyboard") }
                }
                if (show) AppToast("Keyboard feedback")
            } } }
        }
        compose.onNodeWithText("Show keyboard").performClick()
        compose.waitUntil(10_000) { keyboardHeight > 0 }
        compose.onNodeWithTag("app_toast").assertIsDisplayed()
        val frame = Rect()
        compose.runOnIdle { view.getWindowVisibleDisplayFrame(frame) }
        val toast = compose.onNodeWithTag("app_toast").fetchSemanticsNode()
        compose.runOnIdle {
            val toastBottom = toast.positionOnScreen.y + toast.size.height
            assertTrue("Toast bottom=$toastBottom should be near the visible frame=$frame", toastBottom > frame.bottom - 72 * densityValue)
            assertTrue("Toast bottom=$toastBottom should be fully above the keyboard frame=$frame", toastBottom <= frame.bottom + 1)
        }
    }


    @Test fun consecutiveEventsFromTheSameSourceDoNotDismissTheNewResult() {
        var consumed = 0
        compose.setContent {
            MaterialTheme { TaskBridgeLanguageProvider(AppLanguage.English) { AppFeedbackHost {
                var event by remember { mutableStateOf(0) }
                var active by remember { mutableStateOf(false) }
                Button(onClick = { event++; active = true }) { Text("Retry") }
                if (active) AppToast("Failed", isError = true, eventKey = event, onDismiss = { consumed++; active = false })
            } } }
        }
        compose.onNodeWithText("Retry").performClick()
        compose.onNodeWithText("Failed").assertIsDisplayed()
        compose.onNodeWithText("Retry").performClick()
        compose.onNodeWithText("Failed").assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, consumed) }
        compose.onNodeWithText("Dismiss").performClick()
        compose.runOnIdle { assertEquals(1, consumed) }
    }

    private fun screenshot(tag: String, name: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val output = File(context.getExternalFilesDir(null), "prompts").apply { mkdirs() }
        val bitmap = compose.onNodeWithTag(tag).captureToImage().asAndroidBitmap()
        File(output, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
