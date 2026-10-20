package com.taskbridge.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

@Stable
class PopconfirmAnchor {
    internal var bounds: IntRect? = null
    internal val targets = mutableMapOf<Any, IntRect>()

    /** Explicit capture also works for TalkBack and semantic clicks. */
    fun select(key: Any) {
        bounds = targets[key]
    }
}

@Composable
fun rememberPopconfirmAnchor(): PopconfirmAnchor = remember { PopconfirmAnchor() }

/** Records the actual trigger without consuming its click or long-press gesture. */
fun Modifier.popconfirmAnchor(anchor: PopconfirmAnchor, key: Any? = null): Modifier = composed {
    var bounds by remember { mutableStateOf<IntRect?>(null) }
    DisposableEffect(anchor, key) {
        onDispose { if (key != null) anchor.targets.remove(key) }
    }
    this
        .onGloballyPositioned { coordinates ->
            val rect = coordinates.boundsInWindow()
            val measured = IntRect(rect.left.roundToInt(), rect.top.roundToInt(), rect.right.roundToInt(), rect.bottom.roundToInt())
            bounds = measured
            if (key == null) anchor.bounds = measured else anchor.targets[key] = measured
        }
        .onFocusChanged { if (it.isFocused) anchor.bounds = bounds }
        .pointerInput(anchor) {
            awaitPointerEventScope {
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    if (event.changes.any { it.pressed && !it.previousPressed }) anchor.bounds = bounds
                }
            }
        }
}

internal fun popconfirmOffset(anchor: IntRect?, window: IntSize, popup: IntSize, margin: Int, gap: Int): IntOffset {
    val maxX = max(margin, window.width - popup.width - margin)
    val maxY = max(margin, window.height - popup.height - margin)
    if (anchor == null) {
        return IntOffset(((window.width - popup.width) / 2).coerceIn(margin, maxX), ((window.height - popup.height) / 2).coerceIn(margin, maxY))
    }
    val below = anchor.bottom + gap
    val above = anchor.top - popup.height - gap
    val y = if (below <= maxY) below else above
    return IntOffset((anchor.center.x - popup.width / 2).coerceIn(margin, maxX), y.coerceIn(margin, maxY))
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
fun AppPopconfirm(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit,
    dismissButton: @Composable () -> Unit = {},
    anchor: PopconfirmAnchor? = null,
    danger: Boolean = false,
) {
    val density = LocalDensity.current
    val margin = with(density) { 16.dp.roundToPx() }
    val gap = with(density) { 8.dp.roundToPx() }
    // Snapshot the originating control: later focus changes inside the popup must not move it.
    val origin = remember { anchor?.bounds }
    val provider = remember(origin, margin, gap) {
        object : PopupPositionProvider {
            override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize) =
                popconfirmOffset(origin, windowSize, popupContentSize, margin, gap)
        }
    }
    val pane = if (LocalAppLanguage.current == AppLanguage.English) "Confirm action" else "确认操作"
    Popup(popupPositionProvider = provider, onDismissRequest = onDismissRequest, properties = PopupProperties(focusable = true)) {
        Surface(
            modifier = Modifier.padding(16.dp).widthIn(max = 360.dp).heightIn(max = (LocalConfiguration.current.screenHeightDp * 0.8f).dp)
                .testTag("app_popconfirm").semantics { paneTitle = pane },
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            tonalElevation = 6.dp,
            shadowElevation = 12.dp,
        ) {
            Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ProvideTextStyle(MaterialTheme.typography.titleMedium.copy(color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)) { title() }
                ProvideTextStyle(MaterialTheme.typography.bodyMedium) { text() }
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    dismissButton()
                    confirmButton()
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
fun AppDrawer(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit = {},
    dismissButton: @Composable () -> Unit = {},
) {
    val isEnglish = LocalAppLanguage.current == AppLanguage.English
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        sheetMaxWidth = 560.dp,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = (LocalConfiguration.current.screenHeightDp * 0.85f).dp)
                .padding(horizontal = 24.dp).padding(bottom = 16.dp).testTag("app_drawer"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { ProvideTextStyle(MaterialTheme.typography.titleLarge) { title() } }
                TextButton(onClick = onDismissRequest) { Text(if (isEnglish) "Close" else "关闭") }
            }
            Column(Modifier.weight(1f, fill = false).fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ProvideTextStyle(MaterialTheme.typography.bodyMedium) { text() }
            }
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                dismissButton()
                confirmButton()
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun AppTooltip(text: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(text) } },
        state = rememberTooltipState(),
        modifier = modifier,
        content = content,
    )
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun AppHelpTooltip(text: String, label: String) {
    val state = rememberTooltipState(isPersistent = true)
    val scope = rememberCoroutineScope()
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(text) } },
        state = state,
    ) {
        TextButton(onClick = { scope.launch { state.show() } }) { Text(label) }
    }
}

private data class ToastMessage(val id: Long, val owner: Any, val text: String, val isError: Boolean, val onDismiss: () -> Unit)

@Stable
private class ToastHostState {
    var current by mutableStateOf<ToastMessage?>(null)
    private var nextId = 0L
    fun show(owner: Any, text: String, isError: Boolean, onDismiss: () -> Unit) {
        // Replaced feedback is consumed too, so its producer can emit the same result again.
        current?.takeIf { it.owner !== owner }?.let { dismiss(it) }
        current = ToastMessage(++nextId, owner, text, isError, onDismiss)
    }
    fun dismissOwner(owner: Any) {
        current?.takeIf { it.owner === owner }?.let { dismiss(it) }
    }
    fun dismiss(message: ToastMessage) {
        if (current?.id == message.id) {
            current = null
            message.onDismiss()
        }
    }
}

private val LocalToastHost = compositionLocalOf<ToastHostState?> { null }

@Composable
fun AppFeedbackHost(content: @Composable () -> Unit) {
    val state = remember { ToastHostState() }
    CompositionLocalProvider(LocalToastHost provides state) {
        Box(Modifier.fillMaxSize()) { content() }
        ToastOverlay(state)
    }
}

/** Feedback is an event; changing eventKey also displays identical consecutive results. */
@Composable
fun AppToast(text: String, isError: Boolean = false, eventKey: Any = text, onDismiss: () -> Unit = {}) {
    val parent = LocalToastHost.current
    val state = parent ?: remember { ToastHostState() }
    val owner = remember { Any() }
    DisposableEffect(state, owner) {
        onDispose { state.dismissOwner(owner) }
    }
    LaunchedEffect(eventKey, text, isError) {
        if (text.isNotBlank()) state.show(owner, text, isError, onDismiss)
        else state.dismissOwner(owner)
    }
    if (parent == null) ToastOverlay(state)
}

@Composable
private fun ToastOverlay(state: ToastHostState) {
    val message = state.current ?: return
    val accessibility = LocalAccessibilityManager.current
    val timeout = accessibility?.calculateRecommendedTimeoutMillis(if (message.isError) 6000L else 4000L, containsIcons = true, containsText = true, containsControls = true)
        ?: if (message.isError) 6000L else 4000L
    LaunchedEffect(message.id) {
        delay(timeout)
        state.dismiss(message)
    }
    val density = LocalDensity.current
    val keyboardVisible = WindowInsets.ime.getBottom(density) > 0
    // PopupPositionProvider receives the visible window, which already excludes the IME.
    val bottomGap = with(density) { (if (keyboardVisible) 16.dp else 88.dp).roundToPx() }
    val provider = remember(bottomGap) {
        object : PopupPositionProvider {
            override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize) =
                IntOffset((windowSize.width - popupContentSize.width) / 2, max(0, windowSize.height - popupContentSize.height - bottomGap))
        }
    }
    val isEnglish = LocalAppLanguage.current == AppLanguage.English
    Popup(popupPositionProvider = provider, properties = PopupProperties(focusable = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
        Surface(
            modifier = Modifier.padding(horizontal = 16.dp).widthIn(max = 480.dp).testTag("app_toast")
                .semantics { liveRegion = if (message.isError) LiveRegionMode.Assertive else LiveRegionMode.Polite },
            shape = RoundedCornerShape(16.dp),
            color = if (message.isError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.inverseSurface,
            contentColor = if (message.isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.inverseOnSurface,
            shadowElevation = 8.dp,
        ) {
            Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(message.text, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { state.dismiss(message) }) {
                    Text(if (isEnglish) "Dismiss" else "关闭", color = if (message.isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.inverseOnSurface)
                }
            }
        }
    }
}
