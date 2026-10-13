package com.taskbridge.app.ui

import android.graphics.Bitmap
import android.graphics.RenderEffect
import android.graphics.Shader
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.glass.GlassStyle
import com.taskbridge.app.ui.components.glass.LiquidGlassSurface
import com.taskbridge.app.ui.components.glass.createGlassEffect
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertTrue

/** Verifies AGSL rendering and foreground interaction on supported Android 13+ devices. */
class LiquidGlassRenderingTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun lightGlassKeepsControlsInteractiveWhileScrolling() = verifyGlass(dark = false)

    @Test
    fun darkGlassKeepsControlsInteractiveWhileScrolling() = verifyGlass(dark = true)

    @Test
    fun refractionDisplacesPixelsBeyondOrdinaryBlur() {
        compose.setContent {
            Column {
                EffectProbe(refract = false)
                EffectProbe(refract = true)
            }
        }
        val blurred = compose.onNodeWithTag("blur").captureToImage().toPixelMap()
        val refracted = compose.onNodeWithTag("lens").captureToImage().toPixelMap()
        var changedPixels = 0
        for (y in 0 until blurred.height) {
            for (x in 0 until blurred.width) {
                if (kotlin.math.abs(blurred[x, y].red - refracted[x, y].red) > 0.04f) changedPixels++
            }
        }
        // Plain blur or omitted refraction must not produce the same image as the AGSL lens.
        assertTrue("AGSL must visibly displace the backdrop beyond ordinary blur", changedPixels > 100)
    }

    private fun verifyGlass(dark: Boolean) {
        compose.setContent {
            val colors = if (dark) {
                darkColorScheme(
                    primary = Color(0xFF79D1BC),
                    surface = Color(0xFF111917),
                    background = Color(0xFF0D1513),
                    onSurface = Color(0xFFE0E9E5),
                )
            } else {
                lightColorScheme(
                    primary = Color(0xFF116C5B),
                    surface = Color.White,
                    background = Color(0xFFF6F8F7),
                    onSurface = Color(0xFF1D2624),
                )
            }
            MaterialTheme(colorScheme = colors) {
                val keyboard = LocalSoftwareKeyboardController.current
                AppPage(Modifier.fillMaxSize()) {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        AppHeader(title = "TaskBridge", subtitle = "今日计划 · Today")
                        LiquidGlassSurface(style = GlassStyle.Elevated, modifier = Modifier.fillMaxWidth()) {
                            Text("今日    全部    设置", Modifier.padding(20.dp))
                        }
                        var saved by remember { mutableStateOf(false) }
                        var title by remember { mutableStateOf("") }
                        AppPanel {
                            Text("专注眼前的一件事", style = MaterialTheme.typography.titleLarge)
                            Text("Keep text sharp above the sampled background.")
                            OutlinedTextField(
                                value = title,
                                onValueChange = { title = it },
                                label = { Text("任务名称") },
                                modifier = Modifier.fillMaxWidth().testTag("title"),
                            )
                            Button(onClick = { saved = true; keyboard?.hide() }, modifier = Modifier.testTag("save")) {
                                Text("保存任务")
                            }
                            if (saved) Text(title, Modifier.testTag("saved"))
                        }
                        LiquidGlassSurface(style = GlassStyle.Quiet, modifier = Modifier.fillMaxWidth()) {
                            Text("准备下一次项目评审", Modifier.padding(20.dp))
                        }
                        Spacer(Modifier.height(600.dp))
                        AppPanel {
                            var count by remember { mutableStateOf(0) }
                            Button(onClick = { count++ }, modifier = Modifier.testTag("end")) {
                                Text("完成 $count")
                            }
                        }
                    }
                }
            }
        }
        compose.onNodeWithTag("title").performTextInput("Review liquid glass")
        compose.onNodeWithTag("save").performScrollTo().performClick()
        compose.onNodeWithTag("saved").assertTextEquals("Review liquid glass")
        compose.onNodeWithText("TaskBridge").performScrollTo()
        saveScreenshot(if (dark) "glass-dark" else "glass-light")

        // Reposition a refractive surface, then verify that its foreground remains reachable.
        compose.onNodeWithTag("end").performScrollTo().performClick()
        compose.onNodeWithText("完成 1").assertIsDisplayed()
        compose.onNodeWithTag("saved").performScrollTo().assertTextEquals("Review liquid glass")
    }

    private fun saveScreenshot(name: String) {
        compose.waitForIdle()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(context.getExternalFilesDir(null), "liquid-glass").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { output ->
            compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, output)
        }
    }
}

@Composable
private fun EffectProbe(refract: Boolean) {
    val layer = rememberGraphicsLayer()
    val lens = remember { createGlassEffect(3f, 24f, 12f) }
    val blur = remember { RenderEffect.createBlurEffect(3f, 3f, Shader.TileMode.CLAMP).asComposeRenderEffect() }
    Box(
        Modifier.size(120.dp).testTag(if (refract) "lens" else "blur").drawWithCache {
            layer.renderEffect = if (refract) checkNotNull(lens).forSize(size, 20f, 0f) else blur
            onDrawBehind {
                layer.record {
                    drawRect(Color.White)
                    var x = 0f
                    while (x < size.width) {
                        drawRect(Color.Black, topLeft = Offset(x, 0f), size = Size(8f, size.height))
                        x += 16f
                    }
                }
                drawLayer(layer)
            }
        },
    )
}
