package com.taskbridge.app.ui.components.glass

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/** Quiet surfaces deliberately avoid an offscreen layer, suitable for long scrolling lists. */
enum class GlassStyle { Panel, Elevated, Quiet }

private class BackdropState(val layer: GraphicsLayer) {
    var positionInWindow by mutableStateOf(Offset.Zero)
}

private val LocalGlassBackdrop = staticCompositionLocalOf<BackdropState?> { null }

/**
 * Records only the decorative background; controls and text never enter the sampled layer.
 *
 * The independent backdrop / foreground approach is inspired by
 * https://github.com/Kyant0/AndroidLiquidGlass (now Backdrop). This implementation stays on
 * the app's existing Compose version and does not include code from that library.
 */
@Composable
fun LiquidGlassBackdrop(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    // rememberGraphicsLayer releases the native layer when this composition leaves the screen.
    val layer = rememberGraphicsLayer()
    val backdrop = remember(layer) { BackdropState(layer) }
    val colors = MaterialTheme.colorScheme
    val dark = colors.background.luminance() < 0.5f
    val baseColor = colors.background
    val emerald = lerp(colors.primary, Color(0xFF49BDA0), 0.35f)
    val blue = if (dark) Color(0xFF4D91AC) else Color(0xFF78BBD0)
    val gold = if (dark) Color(0xFFB9934C) else Color(0xFFE7C787)

    CompositionLocalProvider(LocalGlassBackdrop provides backdrop) {
        Box(
            modifier = modifier
                .onGloballyPositioned { backdrop.positionInWindow = it.positionInWindow() }
                .drawWithCache {
                    val backgroundSize = size
                    val radius = max(size.width, size.height).coerceAtLeast(1f)
                    val greenGlow = Brush.radialGradient(
                        colors = listOf(emerald.copy(alpha = if (dark) 0.28f else 0.25f), Color.Transparent),
                        center = Offset(size.width * 0.03f, size.height * 0.12f),
                        radius = radius * 0.72f,
                    )
                    val blueGlow = Brush.radialGradient(
                        colors = listOf(blue.copy(alpha = if (dark) 0.16f else 0.19f), Color.Transparent),
                        center = Offset(size.width * 1.02f, size.height * 0.54f),
                        radius = radius * 0.52f,
                    )
                    val goldGlow = Brush.radialGradient(
                        colors = listOf(gold.copy(alpha = if (dark) 0.12f else 0.20f), Color.Transparent),
                        center = Offset(size.width * 0.15f, size.height * 0.97f),
                        radius = radius * 0.57f,
                    )
                    // Soft, stationary arcs add enough local contrast for the edge lens to bend.
                    // Their broad spacing keeps the backdrop quiet behind long blocks of text.
                    val greenRibbon = Brush.radialGradient(
                        0f to Color.Transparent,
                        0.84f to Color.Transparent,
                        0.885f to emerald.copy(alpha = if (dark) 0.30f else 0.26f),
                        0.93f to Color.Transparent,
                        1f to Color.Transparent,
                        center = Offset(size.width * -0.22f, size.height * 0.18f),
                        radius = radius * 0.88f,
                    )
                    val blueRibbon = Brush.radialGradient(
                        0f to Color.Transparent,
                        0.79f to Color.Transparent,
                        0.84f to blue.copy(alpha = 0.24f),
                        0.90f to Color.Transparent,
                        1f to Color.Transparent,
                        center = Offset(size.width * 1.08f, size.height * 0.07f),
                        radius = radius * 0.58f,
                    )
                    val goldRibbon = Brush.radialGradient(
                        0f to Color.Transparent,
                        0.80f to Color.Transparent,
                        0.87f to gold.copy(alpha = if (dark) 0.16f else 0.22f),
                        0.935f to Color.Transparent,
                        1f to Color.Transparent,
                        center = Offset(size.width * 0.08f, size.height * 1.18f),
                        radius = radius * 0.48f,
                    )
                    val drawBackground: DrawScope.() -> Unit = {
                        drawRect(baseColor)
                        drawRect(greenGlow)
                        drawRect(blueGlow)
                        drawRect(goldGlow)
                        drawRect(greenRibbon)
                        drawRect(blueRibbon)
                        drawRect(goldRibbon)
                    }
                    var recorded = false
                    onDrawBehind {
                        if (drawContext.canvas.nativeCanvas.isHardwareAccelerated) {
                            if (!recorded && backgroundSize.width > 0 && backgroundSize.height > 0) {
                                layer.record(
                                    density = this,
                                    layoutDirection = layoutDirection,
                                    size = backgroundSize.toLayerSize(),
                                    block = drawBackground,
                                )
                                recorded = true
                            }
                            if (recorded) drawLayer(layer)
                        } else {
                            drawBackground()
                        }
                    }
                },
            propagateMinConstraints = true,
            content = content,
        )
    }
}

/**
 * A non-interactive glass container. Effects apply exclusively to the backdrop; the content
 * is drawn normally afterward, preserving text sharpness and all child semantics.
 * Outside [LiquidGlassBackdrop], it automatically uses the translucent surface treatment.
 */
@Composable
fun LiquidGlassSurface(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 20.dp,
    style: GlassStyle = GlassStyle.Panel,
    borderColor: Color? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val dark = colors.background.luminance() < 0.5f
    val shape = RoundedCornerShape(cornerRadius)
    val backdrop = LocalGlassBackdrop.current
    val samplesBackdrop = style != GlassStyle.Quiet && backdrop != null
    val sampleLayer = if (samplesBackdrop) rememberGraphicsLayer() else null
    var positionInWindow by remember { mutableStateOf(Offset.Zero) }
    val density = LocalDensity.current
    val blurRadius = with(density) { (if (style == GlassStyle.Elevated) 3.dp else 4.dp).toPx() }
    val edgeWidth = with(density) { 18.dp.toPx() }
    val refraction = with(density) { (if (style == GlassStyle.Elevated) 12.dp else 8.dp).toPx() }
    val effect = remember(samplesBackdrop, blurRadius, edgeWidth, refraction) {
        if (samplesBackdrop) createGlassEffect(blurRadius, edgeWidth, refraction) else null
    }
    val tintAlpha = when (style) {
        GlassStyle.Panel -> if (dark) 0.40f else 0.34f
        GlassStyle.Elevated -> if (dark) 0.46f else 0.38f
        GlassStyle.Quiet -> if (dark) 0.68f else 0.72f
    }
    val tint = colors.surface.copy(alpha = tintAlpha)
    // Quiet rows and drawing without a hardware backdrop still need a readable surface.
    val unsampledTint = colors.surface.copy(alpha = if (style == GlassStyle.Quiet) tintAlpha else 0.88f)
    val rim = remember(borderColor, dark) {
        borderColor?.let(::SolidColor) ?: Brush.linearGradient(
            colors = listOf(
                Color.White.copy(alpha = if (dark) 0.32f else 0.88f),
                Color.White.copy(alpha = if (dark) 0.08f else 0.24f),
                Color.White.copy(alpha = if (dark) 0.17f else 0.56f),
            ),
        )
    }
    val shadowElevation = when (style) {
        GlassStyle.Panel -> 4.dp
        GlassStyle.Elevated -> 9.dp
        GlassStyle.Quiet -> 0.dp
    }
    val glassModifier = Modifier
        .then(
            if (samplesBackdrop) {
                Modifier.onGloballyPositioned { positionInWindow = it.positionInWindow() }
            } else {
                Modifier
            },
        )
        .shadow(
            elevation = shadowElevation,
            shape = shape,
            clip = false,
            ambientColor = Color(0xFF153D35).copy(alpha = if (dark) 0.30f else 0.16f),
            spotColor = Color(0xFF153D35).copy(alpha = if (dark) 0.38f else 0.20f),
        )
        .clip(shape)
        .border(width = 1.dp, brush = rim, shape = shape)
        .drawWithCache {
            val localSize = size
            val relativePosition = positionInWindow - (backdrop?.positionInWindow ?: Offset.Zero)
            // Overscan keeps blur and refraction from sampling transparent pixels at panel edges.
            val inset = ceil(blurRadius * 2f + refraction)
            val expandedSize = Size(size.width + inset * 2f, size.height + inset * 2f)
            val radius = cornerRadius.toPx().coerceIn(0f, min(size.width, size.height) / 2f)
            val gloss = Brush.verticalGradient(
                colors = listOf(
                    Color.White.copy(alpha = if (dark) 0.045f else 0.14f),
                    Color.Transparent,
                ),
            )
            var recorded = false
            onDrawBehind {
                val canSample = sampleLayer != null && effect != null && backdrop != null &&
                    localSize.width > 0 && localSize.height > 0 &&
                    backdrop.layer.size.width > 0 && backdrop.layer.size.height > 0 &&
                    !backdrop.layer.isReleased && drawContext.canvas.nativeCanvas.isHardwareAccelerated
                if (canSample) {
                    // These are non-null by canSample; locals also make the draw lambda independent
                    // of smart-cast behavior for captured nullable values.
                    val targetLayer = checkNotNull(sampleLayer)
                    val sourceLayer = checkNotNull(backdrop).layer
                    if (!recorded) {
                        targetLayer.renderEffect = checkNotNull(effect).forSize(localSize, radius, inset)
                        targetLayer.record(
                            density = this,
                            layoutDirection = layoutDirection,
                            size = expandedSize.toLayerSize(),
                        ) {
                            // The background base also covers overscan beyond the viewport.
                            drawRect(colors.background)
                            translate(inset - relativePosition.x, inset - relativePosition.y) {
                                drawLayer(sourceLayer)
                            }
                        }
                        recorded = true
                    }
                    translate(-inset, -inset) { drawLayer(targetLayer) }
                    drawRect(tint)
                } else {
                    drawRect(unsampledTint)
                }
                drawRect(gloss)
            }
        }

    CompositionLocalProvider(LocalContentColor provides colors.onSurface) {
        Box(
            modifier = modifier.then(glassModifier),
            propagateMinConstraints = true,
            content = content,
        )
    }
}

private fun Size.toLayerSize() = IntSize(ceil(width).toInt(), ceil(height).toInt())
