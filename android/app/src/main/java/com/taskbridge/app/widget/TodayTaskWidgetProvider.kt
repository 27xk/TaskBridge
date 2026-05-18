package com.taskbridge.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import com.taskbridge.app.MainActivity
import com.taskbridge.app.R

class TodayTaskWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        TodayTaskWidgetUpdateWorker.enqueue(context)
    }

    companion object {
        private val rowIds = intArrayOf(
            R.id.widgetTaskRow1,
            R.id.widgetTaskRow2,
            R.id.widgetTaskRow3,
            R.id.widgetTaskRow4,
            R.id.widgetTaskRow5,
            R.id.widgetTaskRow6,
            R.id.widgetTaskRow7,
            R.id.widgetTaskRow8,
        )
        private val statusIds = intArrayOf(
            R.id.widgetTaskStatus1,
            R.id.widgetTaskStatus2,
            R.id.widgetTaskStatus3,
            R.id.widgetTaskStatus4,
            R.id.widgetTaskStatus5,
            R.id.widgetTaskStatus6,
            R.id.widgetTaskStatus7,
            R.id.widgetTaskStatus8,
        )
        private val titleIds = intArrayOf(
            R.id.widgetTaskTitle1,
            R.id.widgetTaskTitle2,
            R.id.widgetTaskTitle3,
            R.id.widgetTaskTitle4,
            R.id.widgetTaskTitle5,
            R.id.widgetTaskTitle6,
            R.id.widgetTaskTitle7,
            R.id.widgetTaskTitle8,
        )
        private val metaIds = intArrayOf(
            R.id.widgetTaskMeta1,
            R.id.widgetTaskMeta2,
            R.id.widgetTaskMeta3,
            R.id.widgetTaskMeta4,
            R.id.widgetTaskMeta5,
            R.id.widgetTaskMeta6,
            R.id.widgetTaskMeta7,
            R.id.widgetTaskMeta8,
        )

        fun updateAll(context: Context, state: TodayTaskWidgetState) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, TodayTaskWidgetProvider::class.java)
            manager.getAppWidgetIds(component).forEach { id ->
                manager.updateAppWidget(id, buildViews(context, state))
            }
        }

        private fun buildViews(context: Context, state: TodayTaskWidgetState): RemoteViews {
            return RemoteViews(context.packageName, R.layout.widget_today_task).apply {
                setFloat(
                    R.id.widgetBackground,
                    "setAlpha",
                    state.opacityPercent.coerceIn(0, 100) / 100f,
                )
                val openTarget = if (state.taskScope == WidgetConstants.TASK_SCOPE_ALL) {
                    WidgetConstants.TARGET_ALL
                } else {
                    WidgetConstants.TARGET_TODAY
                }
                setOnClickPendingIntent(R.id.widgetRoot, openAppIntent(context, openTarget))

                val message = when {
                    !state.isLoggedIn -> "请登录 TaskBridge"
                    state.taskScope == WidgetConstants.TASK_SCOPE_ALL && state.tasks.isEmpty() -> "暂无任务"
                    state.tasks.isEmpty() -> "今天暂无待办"
                    else -> null
                }
                setViewVisibility(R.id.widgetMessage, if (message == null) View.GONE else View.VISIBLE)
                setViewVisibility(R.id.widgetSpacer, if (message == null) View.VISIBLE else View.GONE)
                setTextViewText(R.id.widgetMessage, message.orEmpty())

                rowIds.forEachIndexed { index, rowId ->
                    val item = state.tasks.getOrNull(index)
                    if (item == null || !state.isLoggedIn) {
                        setViewVisibility(rowId, View.GONE)
                    } else {
                        bindTaskRow(context, this, index, item)
                    }
                }
            }
        }

        private fun bindTaskRow(
            context: Context,
            views: RemoteViews,
            index: Int,
            item: TodayTaskWidgetItem,
        ) {
            val titleColor = if (item.isCompleted) Color.argb(178, 255, 255, 255) else Color.WHITE
            val metaColor = if (item.isCompleted) Color.argb(140, 255, 255, 255) else Color.argb(216, 255, 255, 255)
            val meta = buildString {
                append(item.dueLabel)
                append(" / ")
                append(item.priorityLabel)
                if (item.isCompleted) append(" / 已完成")
            }

            views.setViewVisibility(rowIds[index], View.VISIBLE)
            views.setTextViewText(statusIds[index], if (item.isCompleted) "✓" else "○")
            views.setTextViewText(titleIds[index], item.title)
            views.setTextColor(titleIds[index], titleColor)
            views.setTextViewText(metaIds[index], meta)
            views.setTextColor(metaIds[index], metaColor)
            views.setOnClickPendingIntent(
                rowIds[index],
                openTaskIntent(context, item.localId, index),
            )
            views.setOnClickPendingIntent(
                statusIds[index],
                if (item.isCompleted) {
                    openTaskIntent(context, item.localId, index)
                } else {
                    completeIntent(context, item.localId)
                },
            )
        }

        private fun openAppIntent(context: Context, target: String): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(WidgetConstants.EXTRA_WIDGET_TARGET, target)
            }
            return PendingIntent.getActivity(
                context,
                target.hashCode(),
                intent,
                pendingIntentFlags(),
            )
        }

        private fun openTaskIntent(context: Context, localId: String, index: Int): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(WidgetConstants.EXTRA_WIDGET_TARGET, WidgetConstants.TARGET_TASK)
                putExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID, localId)
            }
            return PendingIntent.getActivity(
                context,
                10_000 + index,
                intent,
                pendingIntentFlags(),
            )
        }

        private fun completeIntent(context: Context, localId: String): PendingIntent {
            val intent = Intent(context, WidgetActionReceiver::class.java).apply {
                action = WidgetConstants.ACTION_COMPLETE
                putExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID, localId)
            }
            return PendingIntent.getBroadcast(
                context,
                20_000 + (localId.hashCode() and 0x3fff),
                intent,
                pendingIntentFlags(),
            )
        }

        private fun pendingIntentFlags(): Int {
            return PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_IMMUTABLE
                } else {
                    0
                }
        }
    }
}
