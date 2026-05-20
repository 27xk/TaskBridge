type TaskRecencyFields = Pick<
  TaskRecord,
  "completedAt" | "updatedAt" | "dueTime" | "plannedDate" | "createdAt"
>;

export function sortCompletedTasksByRecency<T extends TaskRecencyFields>(tasks: readonly T[]): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const recencyDiff = completedRecencyTime(right.task) - completedRecencyTime(left.task);
      return recencyDiff || left.index - right.index;
    })
    .map((item) => item.task);
}

function completedRecencyTime(task: TaskRecencyFields): number {
  return (
    parseTaskTime(task.completedAt) ??
    parseTaskTime(task.updatedAt) ??
    parseTaskTime(task.dueTime) ??
    parseTaskTime(task.plannedDate) ??
    parseTaskTime(task.createdAt) ??
    0
  );
}

function parseTaskTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
