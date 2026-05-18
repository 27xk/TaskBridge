package com.taskbridge.app.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
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
import android.content.Intent
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.gson.Gson
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings

@Composable
fun SettingsScreen(
    taskRepository: TaskRepository,
    language: AppLanguage,
    onLanguageChange: (AppLanguage) -> Unit,
    onBack: () -> Unit,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val strings = LocalTaskBridgeStrings.current
    val tasks = taskRepository.observeTasks().collectAsStateWithLifecycle(initialValue = emptyList()).value
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        Text(strings.settings, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))
        Text(strings.language)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { onLanguageChange(AppLanguage.Chinese) },
                enabled = language != AppLanguage.Chinese,
            ) {
                Text(strings.chinese)
            }
            Button(
                onClick = { onLanguageChange(AppLanguage.English) },
                enabled = language != AppLanguage.English,
            ) {
                Text(strings.english)
            }
        }
        Spacer(Modifier.height(16.dp))
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
                context.startActivity(Intent.createChooser(intent, strings.exportBackup))
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(strings.exportBackup)
        }
        Spacer(Modifier.height(8.dp))
        Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
            Text(strings.signOut)
        }
        TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text(strings.back)
        }
    }
}
