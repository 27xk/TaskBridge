package com.taskbridge.app.ui.components

import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import org.junit.Assert.assertEquals
import org.junit.Test

class PopconfirmPositionTest {
    private val window = IntSize(400, 800)
    private val popup = IntSize(320, 240)

    @Test fun confirmationAppearsBelowItsTrigger() {
        assertEquals(IntOffset(40, 156), popconfirmOffset(IntRect(150, 100, 250, 148), window, popup, 16, 8))
    }

    @Test fun confirmationFlipsAboveBottomControls() {
        assertEquals(IntOffset(40, 452), popconfirmOffset(IntRect(150, 700, 250, 748), window, popup, 16, 8))
    }

    @Test fun confirmationStaysInsideBothHorizontalEdges() {
        assertEquals(16, popconfirmOffset(IntRect(0, 100, 48, 148), window, popup, 16, 8).x)
        assertEquals(64, popconfirmOffset(IntRect(352, 100, 400, 148), window, popup, 16, 8).x)
    }

    @Test fun externalRequestsHaveAnAccessibleWindowFallback() {
        assertEquals(IntOffset(40, 280), popconfirmOffset(null, window, popup, 16, 8))
    }

    @Test fun staleOffscreenAnchorsAreClampedAfterLayoutChanges() {
        assertEquals(IntOffset(64, 544), popconfirmOffset(IntRect(900, 2000, 950, 2048), window, popup, 16, 8))
    }
}
