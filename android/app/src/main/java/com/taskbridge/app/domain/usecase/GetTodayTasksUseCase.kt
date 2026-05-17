package com.taskbridge.app.domain.usecase

import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.Task
import kotlinx.coroutines.flow.Flow

class GetTodayTasksUseCase(
    private val taskRepository: TaskRepository,
) {
    operator fun invoke(todayPrefix: String): Flow<List<Task>> {
        return taskRepository.observeTodayTasks(todayPrefix)
    }
}

