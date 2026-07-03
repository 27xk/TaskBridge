package com.taskbridge.app.ui.settings

fun syncQueueDiagnosticText(
    action: String,
    taskTitle: String?,
    attemptCount: Int,
    isEnglish: Boolean,
): String {
    val title = taskTitle?.takeIf { it.isNotBlank() }
        ?: if (isEnglish) "Untitled task" else "未命名任务"
    val actionLabel = syncQueueActionLabel(action, isEnglish)
    val attempts = if (isEnglish) "Tried $attemptCount times" else "已尝试 $attemptCount 次"
    return "$title · $actionLabel · $attempts"
}

fun backupExportSensitiveWarning(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Local backups include task titles, content, checklists, times, and sync fields. Share only with trusted apps or people."
    } else {
        "本地备份会包含任务标题、内容、清单、时间和同步字段。请只分享给可信应用或人员。"
    }
}

fun backupImportEmptyFileMessage(isEnglish: Boolean): String {
    return if (isEnglish) {
        "The selected file is empty."
    } else {
        "\u6240\u9009\u6587\u4ef6\u4e3a\u7a7a\u3002"
    }
}

fun backupImportOversizedFileMessage(isEnglish: Boolean): String {
    return if (isEnglish) {
        "The backup file is too large to import."
    } else {
        "\u5907\u4efd\u6587\u4ef6\u8fc7\u5927\uff0c\u5df2\u62d2\u7edd\u5bfc\u5165\u3002"
    }
}

fun canUndoImportedBackupTask(currentUpdatedAt: String, importedUpdatedAt: String): Boolean {
    return currentUpdatedAt.isNotBlank() && currentUpdatedAt == importedUpdatedAt
}

fun backupImportUndoConfirmationText(count: Int, isEnglish: Boolean): String {
    return if (isEnglish) {
        "Undo $count imported tasks from the most recent import? Tasks edited after import will be kept."
    } else {
        "\u64a4\u9500\u6700\u8fd1\u4e00\u6b21\u5bfc\u5165\u7684 $count \u6761\u4efb\u52a1\uff1f\u5bfc\u5165\u540e\u7f16\u8f91\u8fc7\u7684\u4efb\u52a1\u4f1a\u4fdd\u7559\u3002"
    }
}

fun backupImportUndoResultText(undoneCount: Int, skippedChangedCount: Int, isEnglish: Boolean): String {
    val base = if (isEnglish) {
        if (undoneCount > 0) {
            "Undid $undoneCount imported tasks."
        } else {
            "No imported tasks could be undone."
        }
    } else {
        if (undoneCount > 0) {
            "\u5df2\u64a4\u9500 $undoneCount \u6761\u5bfc\u5165\u4efb\u52a1\u3002"
        } else {
            "\u6ca1\u6709\u53ef\u64a4\u9500\u7684\u5bfc\u5165\u4efb\u52a1\u3002"
        }
    }
    if (skippedChangedCount <= 0) return base
    return if (isEnglish) {
        val noun = if (skippedChangedCount == 1) "task was" else "tasks were"
        "$base $skippedChangedCount changed $noun kept."
    } else {
        "$base $skippedChangedCount \u6761\u5bfc\u5165\u540e\u4fee\u6539\u8fc7\u7684\u4efb\u52a1\u5df2\u4fdd\u7559\u3002"
    }
}

fun syncRecoverySummaryText(
    pendingQueueCount: Int,
    exhaustedQueueCount: Int,
    failedTaskCount: Int,
    isEnglish: Boolean,
): String {
    return if (isEnglish) {
        "$pendingQueueCount tasks waiting to sync / $exhaustedQueueCount needs a retry / $failedTaskCount failed"
    } else {
        "$pendingQueueCount \u6761\u4efb\u52a1\u7b49\u5f85\u540c\u6b65 / $exhaustedQueueCount \u6761\u9700\u8981\u91cd\u8bd5 / $failedTaskCount \u6761\u540c\u6b65\u5931\u8d25"
    }
}

fun syncAtAGlanceText(
    pendingQueueCount: Int,
    exhaustedQueueCount: Int,
    failedTaskCount: Int,
    conflictTaskCount: Int,
    isEnglish: Boolean,
): String {
    return if (hasSyncAttention(pendingQueueCount, exhaustedQueueCount, failedTaskCount, conflictTaskCount)) {
        if (isEnglish) {
            "Pending, failed, or conflicting tasks need attention. Check sync details."
        } else {
            "\u5b58\u5728\u5f85\u540c\u6b65\u3001\u5931\u8d25\u6216\u51b2\u7a81\u7684\u4efb\u52a1\uff0c\u8bf7\u5728\u540c\u6b65\u8be6\u60c5\u4e2d\u5904\u7406\u3002"
        }
    } else {
        if (isEnglish) {
            "No pending, failed, or conflicting tasks are shown. You usually do not need to do anything."
        } else {
            "\u5f53\u524d\u6ca1\u6709\u5f85\u540c\u6b65\u3001\u5931\u8d25\u6216\u51b2\u7a81\u7684\u4efb\u52a1\uff0c\u901a\u5e38\u4e0d\u9700\u8981\u624b\u52a8\u5904\u7406\u3002"
        }
    }
}

fun syncNextStepText(
    pendingQueueCount: Int,
    exhaustedQueueCount: Int,
    failedTaskCount: Int,
    conflictTaskCount: Int,
    isEnglish: Boolean,
): String {
    return if (hasSyncAttention(pendingQueueCount, exhaustedQueueCount, failedTaskCount, conflictTaskCount)) {
        if (isEnglish) {
            "Next step: Open sync details and resolve failed items or conflicts before clearing this device."
        } else {
            "\u4e0b\u4e00\u6b65\uff1a\u6253\u5f00\u540c\u6b65\u8be6\u60c5\uff0c\u5148\u5904\u7406\u5931\u8d25\u6216\u51b2\u7a81\uff0c\u518d\u6e05\u9664\u8fd9\u53f0\u8bbe\u5907\u7684\u6570\u636e\u3002"
        }
    } else {
        if (isEnglish) {
            "Next step: keep adding tasks. TaskBridge will sync automatically."
        } else {
            "\u4e0b\u4e00\u6b65\uff1a\u7ee7\u7eed\u8bb0\u5f55\u4efb\u52a1\uff0cTaskBridge \u4f1a\u81ea\u52a8\u540c\u6b65\u3002"
        }
    }
}

fun localDataTrustText(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Local data only affects this device. Server tasks will not be deleted. Export a local backup first if needed."
    } else {
        "\u672c\u673a\u6570\u636e\u53ea\u5f71\u54cd\u8fd9\u53f0\u8bbe\u5907\uff1b\u6e05\u9664\u8fd9\u53f0\u8bbe\u5907\u4e0d\u4f1a\u5220\u9664\u670d\u52a1\u5668\u4e0a\u7684\u4efb\u52a1\u3002\u64cd\u4f5c\u524d\u53ef\u5148\u5bfc\u51fa\u672c\u673a\u5907\u4efd\u3002"
    }
}

fun syncRecoveryRetryButtonText(isEnglish: Boolean): String {
    return if (isEnglish) "Retry pending or failed sync" else "\u91cd\u8bd5\u5f85\u5904\u7406\u6216\u5931\u8d25\u540c\u6b65"
}

fun syncRecoveryRetryAvailableText(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Pending or failed changes can be retried now."
    } else {
        "\u6709\u7b49\u5f85\u4e2d\u6216\u5931\u8d25\u7684\u540c\u6b65\u4fee\u6539\uff0c\u53ef\u4ee5\u7acb\u5373\u91cd\u8bd5\u3002"
    }
}

fun syncRecoveryNoManualRetryText(isEnglish: Boolean): String {
    return if (isEnglish) "No tasks need a manual retry." else "\u5f53\u524d\u6ca1\u6709\u9700\u8981\u624b\u52a8\u91cd\u8bd5\u7684\u4efb\u52a1\u3002"
}

fun syncRecoveryRetryStartedText(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Retry for pending or failed sync has started."
    } else {
        "\u5df2\u91cd\u65b0\u53d1\u8d77\u5f85\u5904\u7406\u6216\u5931\u8d25\u7684\u540c\u6b65\u3002"
    }
}

private fun hasSyncAttention(
    pendingQueueCount: Int,
    exhaustedQueueCount: Int,
    failedTaskCount: Int,
    conflictTaskCount: Int,
): Boolean {
    return pendingQueueCount > 0 ||
        exhaustedQueueCount > 0 ||
        failedTaskCount > 0 ||
        conflictTaskCount > 0
}

private fun syncQueueActionLabel(action: String, isEnglish: Boolean): String {
    return when (action.lowercase()) {
        "create" -> if (isEnglish) "Create task" else "创建任务"
        "update" -> if (isEnglish) "Update task" else "更新任务"
        "delete" -> if (isEnglish) "Delete task" else "删除任务"
        "restore" -> if (isEnglish) "Restore task" else "恢复任务"
        else -> if (isEnglish) "Sync task" else "同步任务"
    }
}
