import { bridge } from "./sqlite";

export async function listTasks(limit = 300, offset = 0): Promise<TaskRecord[]> {
  return bridge().db.listTasks(limit, offset);
}

export async function listTodayTasks(limit = 120): Promise<TaskRecord[]> {
  return bridge().db.listTodayTasks(limit);
}

export async function listFloatingTodayTasks(limit = 8): Promise<TaskRecord[]> {
  return bridge().task.listToday(limit);
}

export async function getTask(localId: string): Promise<TaskRecord | null> {
  return bridge().db.getTask(localId);
}

export async function saveTask(task: TaskRecord): Promise<TaskRecord> {
  return bridge().db.upsertTask(task);
}

export async function saveTasks(tasks: TaskRecord[]): Promise<void> {
  for (const task of tasks) {
    await saveTask(task);
  }
}

export async function softDeleteLocalTask(localId: string): Promise<void> {
  return bridge().db.deleteLocalTask(localId);
}

export async function quickAddTodayTask(title: string): Promise<TaskRecord | null> {
  return bridge().task.quickAdd(title);
}

export async function completeFloatingTask(localId: string): Promise<TaskRecord | null> {
  return bridge().task.complete(localId);
}

export async function openTaskDetail(localId: string): Promise<void> {
  return bridge().task.openDetail(localId);
}
