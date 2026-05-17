package com.taskbridge.app.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.taskbridge.app.BuildConfig
import android.content.Intent
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.gson.Gson
import com.taskbridge.app.data.repository.TaskRepository

@Composable
fun SettingsScreen(
    taskRepository: TaskRepository,
    onBack: () -> Unit,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val tasks = taskRepository.observeTasks().collectAsStateWithLifecycle(initialValue = emptyList()).value
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))
        Text("API")
        Text(BuildConfig.TASKBRIDGE_BASE_URL, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        Text("WebSocket")
        Text(BuildConfig.TASKBRIDGE_WS_URL, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/json"
                    putExtra(Intent.EXTRA_SUBJECT, "TaskBridge backup")
                    putExtra(
                        Intent.EXTRA_TEXT,
                        Gson().toJson(
                            mapOf(
                                "format" to "taskbridge.local.backup.v1",
                                "exported_at" to java.time.Instant.now().toString(),
                                "tasks" to tasks,
                            ),
                        ),
                    )
                }
                context.startActivity(Intent.createChooser(intent, "导出 TaskBridge 数据"))
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("导出本地备份")
        }
        Spacer(Modifier.height(8.dp))
        Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
            Text("Sign out")
        }
        TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Back")
        }
    }
}
