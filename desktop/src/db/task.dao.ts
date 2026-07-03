import { bridge } from "./sqlite";

const TASK_PAGE_SIZE = 1_000;
const TODAY_TASK_LIMIT = 5_000;

export async function listTasks(limit?: number, offset = 0, includeDeleted = false): Promise<TaskRecord[]> {
  if (limit === undefined && offset === 0) {
    return listAllTasks(includeDeleted);
  }
  return bridge().db.listTasks(limit, offset, includeDeleted);
}

async function listAllTasks(includeDeleted = false): Promise<TaskRecord[]> {
  const tasks: TaskRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await bridge().db.listTasks(TASK_PAGE_SIZE, offset, includeDeleted);
    tasks.push(...page);
    if (page.length < TASK_PAGE_SIZE) return tasks;
    offset += page.length;
  }
}

export async function listTodayTasks(limit = TODAY_TASK_LIMIT): Promise<TaskRecord[]> {
  return bridge().db.listTodayTasks(limit);
}

export async function listFloatingTodayTasks(limit = 8): Promise<TaskRecord[]> {
  return bridge().task.listToday(limit);
}

export async function getTask(localId: string): Promise<TaskRecord | null> {
  return bridge().db.getTask(localId);
}

export async function getTasksByServerIds(serverIds: number[]): Promise<TaskRecord[]> {
  return bridge().db.getTasksByServerIds(serverIds);
}

export async function saveTask(task: TaskRecord): Promise<TaskRecord> {
  return bridge().db.upsertTask(task);
}

export async function saveTasks(tasks: TaskRecord[]): Promise<void> {
  if (tasks.length === 0) return;
  await bridge().db.upsertTasks(tasks);
}

export async function softDeleteLocalTask(localId: string): Promise<void> {
  return bridge().db.deleteLocalTask(localId);
}

export async function purgeLocalTask(localId: string): Promise<void> {
  return bridge().db.purgeLocalTask(localId);
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
