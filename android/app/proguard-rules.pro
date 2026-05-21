# Keep only classes referenced by Android framework or WorkManager class names.
-keep class com.taskbridge.app.widget.TodayTaskWidgetProvider { *; }
-keep class com.taskbridge.app.widget.WidgetActionReceiver { *; }
-keep class com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker { *; }
-keep class com.taskbridge.app.sync.SyncWorker { *; }

# Gson serializes API DTOs by field name when @SerializedName is not present.
# R8 would otherwise rename fields such as password to a/b/c in release builds.
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.taskbridge.app.data.remote.dto.** { *; }
