package com.taskbridge.app.ui.components.glass

import android.graphics.RenderEffect as AndroidRenderEffect
import android.graphics.RuntimeShader
import android.graphics.Shader
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.RenderEffect
import androidx.compose.ui.graphics.asComposeRenderEffect

internal interface GlassEffect {
    fun forSize(size: Size, cornerRadius: Float, inset: Float): RenderEffect
}

/** Android 13 is the minimum supported OS, so every sampled surface uses the AGSL lens. */
internal fun createGlassEffect(blurRadius: Float, edgeWidth: Float, refraction: Float): GlassEffect =
    RefractiveGlassEffect(blurRadius, edgeWidth, refraction)

private class RefractiveGlassEffect(
    blurRadius: Float,
    private val edgeWidth: Float,
    private val refraction: Float,
) : GlassEffect {
    // Compile once per surface, never in a frame callback or a draw lambda.
    private val shader = RuntimeShader(LIQUID_GLASS_SHADER)
    private val blur = AndroidRenderEffect.createBlurEffect(
        blurRadius,
        blurRadius,
        Shader.TileMode.CLAMP,
    )
    private var previousSize = Size.Unspecified
    private var previousRadius = Float.NaN
    private var previousInset = Float.NaN
    private var cachedEffect: RenderEffect? = null

    override fun forSize(size: Size, cornerRadius: Float, inset: Float): RenderEffect {
        val previousEffect = cachedEffect
        if (previousEffect != null && previousSize == size &&
            previousRadius == cornerRadius && previousInset == inset
        ) {
            return previousEffect
        }
        shader.setFloatUniform("surfaceSize", size.width, size.height)
        shader.setFloatUniform("cornerRadius", cornerRadius)
        shader.setFloatUniform("inset", inset)
        shader.setFloatUniform("edgeWidth", edgeWidth)
        shader.setFloatUniform("refraction", refraction)
        // Android snapshots shader uniforms in a RenderEffect. Rebuild only when geometry
        // changes; scrolling updates the recorded backdrop position without rebuilding it.
        val lens = AndroidRenderEffect.createRuntimeShaderEffect(shader, "backdrop")
        return AndroidRenderEffect.createChainEffect(lens, blur).asComposeRenderEffect().also {
            previousSize = size
            previousRadius = cornerRadius
            previousInset = inset
            cachedEffect = it
        }
    }
}

/**
 * Original rounded-rectangle SDF lens. The gradient of the distance field gives a stable
 * outward normal along both straight edges and round corners. Only an inner edge band bends
 * the sampled background, while the center stays undistorted. The foreground is never input.
 */
private const val LIQUID_GLASS_SHADER = """
    uniform shader backdrop;
    uniform float2 surfaceSize;
    uniform float cornerRadius;
    uniform float inset;
    uniform float edgeWidth;
    uniform float refraction;

    float roundedRectDistance(float2 point) {
        float2 halfSize = surfaceSize * 0.5;
        float2 q = abs(point - halfSize) - (halfSize - cornerRadius);
        return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - cornerRadius;
    }

    half4 main(float2 coordinate) {
        float2 point = coordinate - float2(inset);
        float distance = roundedRectDistance(point);
        float edge = 1.0 - smoothstep(0.0, edgeWidth, max(-distance, 0.0));
        float2 gradient = float2(
            roundedRectDistance(point + float2(0.5, 0.0)) -
                roundedRectDistance(point - float2(0.5, 0.0)),
            roundedRectDistance(point + float2(0.0, 0.5)) -
                roundedRectDistance(point - float2(0.0, 0.5))
        );
        float2 normal = gradient / max(length(gradient), 0.001);
        float2 samplePoint = coordinate - normal * (refraction * edge * edge);
        return backdrop.eval(samplePoint);
    }
"""
