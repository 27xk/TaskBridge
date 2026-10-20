package com.taskbridge.app.ui.task

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.taskbridge.app.ui.components.glass.GlassStyle
import com.taskbridge.app.ui.components.glass.LiquidGlassBackdrop
import com.taskbridge.app.ui.components.glass.LiquidGlassSurface
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeStrings
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

@Composable
internal fun TaskHomeScaffold(
    todaySelected: Boolean,
    strings: TaskBridgeStrings,
    onTodayClick: () -> Unit,
    onAllClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onAddClick: (() -> Unit)? = null,
    settingsSelected: Boolean = false,
    topBar: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    val isEnglish = LocalAppLanguage.current.code == "en-US"
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    LiquidGlassBackdrop(Modifier.fillMaxSize()) {
        // Own the safe area here; child bars and the list receive no duplicate system insets.
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .imePadding(),
        ) {
            val useRail = maxWidth >= 600.dp
            Row(Modifier.fillMaxSize()) {
                if (useRail) {
                    LiquidGlassSurface(
                        modifier = Modifier.padding(start = 12.dp, end = 8.dp, top = 12.dp, bottom = 12.dp)
                            .fillMaxHeight().testTag("home-navigation"),
                        cornerRadius = 28.dp,
                        style = GlassStyle.Elevated,
                    ) {
                        NavigationRail(
                            modifier = Modifier.fillMaxHeight(),
                            containerColor = Color.Transparent,
                            windowInsets = WindowInsets(0, 0, 0, 0),
                        ) {
                            HomeRailItem(
                                selected = todaySelected && !settingsSelected,
                                label = strings.today, icon = TaskHomeIcon.Today,
                                tag = "home-nav-today", onClick = onTodayClick,
                            )
                            HomeRailItem(
                                selected = !todaySelected && !settingsSelected,
                                label = strings.all, icon = TaskHomeIcon.All,
                                tag = "home-nav-all", onClick = onAllClick,
                            )
                            HomeRailItem(
                                selected = settingsSelected,
                                label = strings.settings, icon = TaskHomeIcon.Settings,
                                tag = "home-nav-settings", onClick = onSettingsClick,
                            )
                        }
                    }
                }
                Scaffold(
                    modifier = Modifier.weight(1f),
                    containerColor = Color.Transparent,
                    contentWindowInsets = WindowInsets(0, 0, 0, 0),
                    topBar = topBar,
                    bottomBar = {
                        if (!useRail && !keyboardVisible) {
                            LiquidGlassSurface(
                                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 12.dp)
                                    .fillMaxWidth().testTag("home-navigation"),
                                cornerRadius = 28.dp,
                                style = GlassStyle.Elevated,
                            ) {
                                NavigationBar(
                                    containerColor = Color.Transparent,
                                    tonalElevation = 0.dp,
                                    windowInsets = WindowInsets(0, 0, 0, 0),
                                ) {
                                    NavigationBarItem(
                                        selected = todaySelected && !settingsSelected,
                                        onClick = onTodayClick,
                                        colors = homeNavigationColors(),
                                        icon = { TaskHomeIcon(TaskHomeIcon.Today, null) },
                                        label = { Text(strings.today, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                                        alwaysShowLabel = true,
                                        modifier = Modifier.testTag("home-nav-today"),
                                    )
                                    NavigationBarItem(
                                        selected = !todaySelected && !settingsSelected,
                                        onClick = onAllClick,
                                        colors = homeNavigationColors(),
                                        icon = { TaskHomeIcon(TaskHomeIcon.All, null) },
                                        label = { Text(strings.all, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                                        alwaysShowLabel = true,
                                        modifier = Modifier.testTag("home-nav-all"),
                                    )
                                    NavigationBarItem(
                                        selected = settingsSelected,
                                        onClick = onSettingsClick,
                                        colors = homeNavigationColors(),
                                        icon = { TaskHomeIcon(TaskHomeIcon.Settings, null) },
                                        label = { Text(strings.settings, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                                        alwaysShowLabel = true,
                                        modifier = Modifier.testTag("home-nav-settings"),
                                    )
                                }
                            }
                        }
                    },
                    floatingActionButton = {
                        if (onAddClick != null && !keyboardVisible) {
                            ExtendedFloatingActionButton(
                                onClick = onAddClick,
                                icon = { TaskHomeIcon(TaskHomeIcon.Add, null) },
                                text = { Text(if (isEnglish) "New task" else "新建待办") },
                                modifier = Modifier.testTag("home-add-task").semantics {
                                    contentDescription = if (isEnglish) "New task" else "新建待办"
                                },
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                        }
                    },
                    content = content,
                )
            }
        }
    }
}

@Composable
private fun homeNavigationColors() = NavigationBarItemDefaults.colors(
    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
    selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
    selectedTextColor = MaterialTheme.colorScheme.primary,
    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
)

@Composable
private fun HomeRailItem(
    selected: Boolean,
    label: String,
    icon: TaskHomeIcon,
    tag: String,
    onClick: () -> Unit,
) {
    NavigationRailItem(
        selected = selected,
        onClick = onClick,
        colors = NavigationRailItemDefaults.colors(
            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
            selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
            selectedTextColor = MaterialTheme.colorScheme.primary,
            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        icon = { TaskHomeIcon(icon, null) },
        label = { Text(label) },
        modifier = Modifier.testTag(tag),
    )
}

@Composable
internal fun TaskHomeHeader(
    title: String,
    dateLabel: String,
    subtitle: String,
    actions: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp)
            .testTag("home-header"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                ),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = listOf(dateLabel, subtitle).filter(String::isNotBlank).joinToString(" · "),
                minLines = 2,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(
            modifier = Modifier.heightIn(min = 48.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = actions,
        )
    }
}

@Composable
internal fun TaskHomeSearch(
    searchQuery: String,
    strings: TaskBridgeStrings,
    onSearchChange: (String) -> Unit,
    showFilter: Boolean,
    filterActive: Boolean,
    onFilterClick: () -> Unit,
) {
    val isEnglish = LocalAppLanguage.current.code == "en-US"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TextField(
            value = searchQuery,
            onValueChange = onSearchChange,
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 56.dp)
                .testTag("home-search"),
            label = { Text(strings.searchHint, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            leadingIcon = { TaskHomeIcon(TaskHomeIcon.Search, null) },
            trailingIcon = if (searchQuery.isNotEmpty()) {
                {
                    IconButton(
                        onClick = { onSearchChange("") },
                        modifier = Modifier.size(48.dp).testTag("home-clear-search"),
                    ) {
                        TaskHomeIcon(
                            TaskHomeIcon.Close,
                            if (isEnglish) "Clear search" else "清空搜索",
                        )
                    }
                }
            } else null,
            singleLine = true,
            shape = RoundedCornerShape(18.dp),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
        )
        if (showFilter) {
            IconButton(
                onClick = onFilterClick,
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        color = if (filterActive) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(16.dp),
                    )
                    .semantics {
                        stateDescription = if (filterActive) {
                            if (isEnglish) "Filters applied" else "已应用筛选"
                        } else {
                            if (isEnglish) "No filters applied" else "未应用筛选"
                        }
                    }
                    .testTag("home-filter"),
            ) {
                TaskHomeIcon(
                    TaskHomeIcon.Filter,
                    if (isEnglish) "Filter tasks" else "筛选待办",
                    tint = if (filterActive) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
internal fun TaskHomeLocalNotice(
    strings: TaskBridgeStrings,
    onSignIn: () -> Unit,
) {
    val isEnglish = LocalAppLanguage.current.code == "en-US"
    val largeText = LocalDensity.current.fontScale > 1.4f
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val stackAction = maxWidth < 320.dp || largeText
        if (stackAction) {
            Column(Modifier.fillMaxWidth()) {
                LocalNoticeMessage(strings, isEnglish, Modifier.fillMaxWidth())
                TextButton(onClick = onSignIn, modifier = Modifier.align(Alignment.End)) {
                    Text(strings.signInToSync)
                }
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LocalNoticeMessage(strings, isEnglish, Modifier.weight(1f))
                TextButton(onClick = onSignIn) { Text(strings.signInToSync) }
            }
        }
    }
}

@Composable
private fun LocalNoticeMessage(
    strings: TaskBridgeStrings,
    isEnglish: Boolean,
    modifier: Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TaskHomeIcon(TaskHomeIcon.Offline, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                strings.localWorkspaceMode,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = if (isEnglish) "Saved here. Sign in to sync." else "保存在本机，登录后可同步",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

internal enum class TaskHomeIcon {
    Today, All, Settings, Add, Search, Filter, Close, More, Sync, Offline, Check,
}

@Composable
internal fun TaskHomeIcon(
    icon: TaskHomeIcon,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
) {
    Icon(
        imageVector = homeIconVectors.getValue(icon),
        contentDescription = contentDescription,
        modifier = modifier.size(24.dp),
        tint = tint,
    )
}

private val homeIconVectors: Map<TaskHomeIcon, ImageVector> by lazy {
    TaskHomeIcon.entries.associateWith { icon ->
        ImageVector.Builder(
            name = "TaskHome${icon.name}",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.8f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                when (icon) {
                    TaskHomeIcon.Today -> {
                        moveTo(8f, 3f); lineTo(8f, 7f)
                        moveTo(16f, 3f); lineTo(16f, 7f)
                        moveTo(4f, 10f); lineTo(20f, 10f)
                        moveTo(6f, 5f); lineTo(18f, 5f)
                        curveTo(19.1f, 5f, 20f, 5.9f, 20f, 7f)
                        lineTo(20f, 19f); curveTo(20f, 20.1f, 19.1f, 21f, 18f, 21f)
                        lineTo(6f, 21f); curveTo(4.9f, 21f, 4f, 20.1f, 4f, 19f)
                        lineTo(4f, 7f); curveTo(4f, 5.9f, 4.9f, 5f, 6f, 5f)
                        moveTo(8f, 15f); lineTo(11f, 15f); lineTo(11f, 18f); lineTo(8f, 18f); close()
                    }
                    TaskHomeIcon.All -> {
                        moveTo(3f, 6f); lineTo(4.5f, 7.5f); lineTo(7f, 4.5f)
                        moveTo(11f, 6f); lineTo(21f, 6f)
                        moveTo(3f, 12f); lineTo(4.5f, 13.5f); lineTo(7f, 10.5f)
                        moveTo(11f, 12f); lineTo(21f, 12f)
                        moveTo(3f, 18f); lineTo(4.5f, 19.5f); lineTo(7f, 16.5f)
                        moveTo(11f, 18f); lineTo(21f, 18f)
                    }
                    TaskHomeIcon.Settings -> {
                        for (tooth in 0 until 8) {
                            val center = tooth * PI / 4 - PI / 2
                            val angles = listOf(-PI / 8, -PI / 16, PI / 16, PI / 8)
                            angles.forEachIndexed { edge, offset ->
                                val radius = if (edge == 0 || edge == 3) 7.6f else 9.6f
                                val x = 12f + cos(center + offset).toFloat() * radius
                                val y = 12f + sin(center + offset).toFloat() * radius
                                if (tooth == 0 && edge == 0) moveTo(x, y) else lineTo(x, y)
                            }
                        }
                        close()
                        circle(12f, 12f, 3.2f)
                    }
                    TaskHomeIcon.Add -> {
                        moveTo(12f, 5f); lineTo(12f, 19f)
                        moveTo(5f, 12f); lineTo(19f, 12f)
                    }
                    TaskHomeIcon.Search -> {
                        circle(10.5f, 10.5f, 6.5f)
                        moveTo(15.2f, 15.2f); lineTo(21f, 21f)
                    }
                    TaskHomeIcon.Filter -> {
                        moveTo(4f, 6f); lineTo(20f, 6f)
                        moveTo(7f, 12f); lineTo(17f, 12f)
                        moveTo(10f, 18f); lineTo(14f, 18f)
                    }
                    TaskHomeIcon.Close -> {
                        moveTo(6f, 6f); lineTo(18f, 18f)
                        moveTo(18f, 6f); lineTo(6f, 18f)
                    }
                    TaskHomeIcon.More -> {
                        circle(5f, 12f, 1f)
                        circle(12f, 12f, 1f)
                        circle(19f, 12f, 1f)
                    }
                    TaskHomeIcon.Sync -> {
                        moveTo(20f, 7f); lineTo(20f, 12f); lineTo(15f, 12f)
                        moveTo(20f, 12f); curveTo(20f, 7.6f, 16.4f, 4f, 12f, 4f)
                        curveTo(9.3f, 4f, 6.9f, 5.3f, 5.5f, 7.3f)
                        moveTo(4f, 17f); lineTo(4f, 12f); lineTo(9f, 12f)
                        moveTo(4f, 12f); curveTo(4f, 16.4f, 7.6f, 20f, 12f, 20f)
                        curveTo(14.7f, 20f, 17.1f, 18.7f, 18.5f, 16.7f)
                    }
                    TaskHomeIcon.Offline -> {
                        moveTo(8.2f, 5.2f); curveTo(9.3f, 4.4f, 10.6f, 4f, 12f, 4f)
                        curveTo(15.4f, 4f, 18.2f, 6.5f, 18.8f, 9.8f)
                        curveTo(21.1f, 10.2f, 22f, 11.8f, 22f, 14f)
                        curveTo(22f, 15.5f, 21.3f, 16.8f, 20.1f, 17.6f)
                        moveTo(16.5f, 19f); lineTo(6f, 19f)
                        curveTo(3.2f, 19f, 1f, 16.8f, 1f, 14f)
                        curveTo(1f, 11.2f, 3.2f, 9f, 6f, 9f)
                        moveTo(3f, 3f); lineTo(21f, 21f)
                    }
                    TaskHomeIcon.Check -> {
                        moveTo(5f, 12f); lineTo(10f, 17f); lineTo(20f, 7f)
                    }
                }
            }
        }.build()
    }
}

private fun PathBuilder.circle(cx: Float, cy: Float, radius: Float) {
    val control = radius * 0.5522848f
    moveTo(cx + radius, cy)
    curveTo(cx + radius, cy + control, cx + control, cy + radius, cx, cy + radius)
    curveTo(cx - control, cy + radius, cx - radius, cy + control, cx - radius, cy)
    curveTo(cx - radius, cy - control, cx - control, cy - radius, cx, cy - radius)
    curveTo(cx + control, cy - radius, cx + radius, cy - control, cx + radius, cy)
    close()
}
