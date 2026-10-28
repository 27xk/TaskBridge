import type { TaskRecord, TaskListSummary, FloatingTaskSummary } from "../../common/task";
import { bridge } from "./sqlite";
import type { TaskCommitRequest, TaskCommitResult, TaskMutationState } from "../../common/task-mutation-policy";
import type { TaskChangeCursor, TaskIndexUpdate, TaskSyncCounts } from "../../common/task-index";

const TASK_PAGE_SIZE = 1_000;

export async function readTaskIndex(previous: TaskChangeCursor | null = null): Promise<TaskIndexUpdate<TaskListSummary>> {
  let cursor = previous;
  for (let attempt = 0; attempt < 3; attempt++) {
    const reset = cursor === null;
    const tasks = new Map<string, TaskListSummary>();
    const removedIds = new Set<string>();
    if (!cursor) {
      let page = await bridge().db.listTaskSnapshotPage(null, TASK_PAGE_SIZE);
      cursor = page.cursor;
      while (true) {
        if (page.cursor.epoch !== cursor.epoch) throw new Error("Workspace changed while reading the task index");
        for (const task of page.tasks) tasks.set(task.localId, task);
        if (page.nextLocalId === null) break;
        page = await bridge().db.listTaskSnapshotPage(page.nextLocalId, TASK_PAGE_SIZE);
      }
    }
    while (cursor) {
      const page = await bridge().db.listTaskChanges(cursor, TASK_PAGE_SIZE);
      if (page.resetRequired) { cursor = null; break; }
      for (const task of page.tasks) { tasks.set(task.localId, task); removedIds.delete(task.localId); }
      for (const id of page.removedIds) { tasks.delete(id); removedIds.add(id); }
      cursor = page.cursor;
      if (!page.hasMore) return { tasks: [...tasks.values()], removedIds: [...removedIds], cursor, reset };
    }
  }
  throw new Error("Tasks changed repeatedly while refreshing the task index");
}

export async function getTaskSyncCounts(): Promise<TaskSyncCounts> {
  return bridge().db.getTaskSyncCounts();
}

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

export async function listTodayTasks(limit?: number, offset = 0): Promise<TaskRecord[]> {
  if (limit !== undefined) return bridge().db.listTodayTasks(limit, offset);
  const tasks: TaskRecord[] = [];
  while (true) {
    const page = await bridge().db.listTodayTasks(TASK_PAGE_SIZE, offset);
    tasks.push(...page);
    if (page.length < TASK_PAGE_SIZE) return tasks;
    offset += page.length;
  }
}

export async function listFloatingTodayTasks(limit = 8): Promise<TaskListSummary[]> {
  return bridge().task.listToday(limit);
}

export async function searchTaskIds(keyword: string): Promise<string[]> {
  return bridge().db.searchTaskIds(keyword);
}

export async function getFloatingTodayTaskSummary(limit = 8): Promise<FloatingTaskSummary> {
  return bridge().task.getTodaySummary(limit);
}

export async function getTask(localId: string): Promise<TaskRecord | null> {
  return bridge().db.getTask(localId);
}

export async function getTasksByServerIds(serverIds: number[]): Promise<TaskRecord[]> {
  return bridge().db.getTasksByServerIds(serverIds);
}

export async function readTaskMutationState(localId: string, workspaceKey: string): Promise<TaskMutationState> {
  return bridge().db.readTaskMutationState(localId, workspaceKey);
}

export async function commitTaskChange(request: TaskCommitRequest): Promise<TaskCommitResult> {
  return bridge().db.commitTaskChange(request);
}

export async function saveTask(task: TaskRecord, expectedWorkspaceKey?: string): Promise<TaskRecord> {
  return bridge().db.upsertTask(task, false, expectedWorkspaceKey);
}

export async function saveRemoteTask(task: TaskRecord, expectedWorkspaceKey: string): Promise<TaskRecord> {
  return bridge().db.upsertTask(task, true, expectedWorkspaceKey);
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

export async function quickAddTodayTask(title: string, submissionId?: string, workspaceKey?: string): Promise<TaskRecord | null> {
  return bridge().task.quickAdd(title, submissionId, workspaceKey);
}

export async function completeFloatingTask(localId: string): Promise<TaskRecord | null> {
  return bridge().task.complete(localId);
}

export async function openTaskDetail(localId: string): Promise<void> {
  return bridge().task.openDetail(localId);
}
