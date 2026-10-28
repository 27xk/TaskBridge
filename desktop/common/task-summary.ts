import type { TaskListItem, TaskListSummary } from "./task";

export const TASK_PREVIEW_LENGTH = 240;

function contentPreview(value: string | null): string | null {
  if (value === null) return null;
  let length = 0;
  let end = 0;
  // SQLite substr counts Unicode code points; stop without expanding a long body into an array.
  for (const character of value) {
    if (length++ === TASK_PREVIEW_LENGTH) break;
    end += character.length;
  }
  return value.slice(0, end);
}

export function toTaskListSummary(task: TaskListItem, changeRevision: number | null = null): TaskListSummary {
  if (!("content" in task)) return task;
  const { content, checklistJson, conflictServerJson, conflictLocalJson: _local, ...summary } = task;
  let items: Array<{ done?: boolean }> = [];
  try {
    const parsed: unknown = JSON.parse(checklistJson);
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* Malformed legacy checklists have no progress badge. */ }
  return { ...summary, contentPreview: contentPreview(content),
    checklistTotal: items.length, checklistDone: items.filter(item => item?.done === true).length,
    hasServerConflict: Boolean(conflictServerJson), changeRevision };
}
