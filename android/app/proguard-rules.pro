# Keep only classes referenced by Android framework or WorkManager class names.
-keep class com.taskbridge.app.widget.TodayTaskWidgetProvider { *; }
-keep class com.taskbridge.app.widget.WidgetActionReceiver { *; }
-keep class com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker { *; }
-keep class com.taskbridge.app.sync.SyncWorker { *; }
