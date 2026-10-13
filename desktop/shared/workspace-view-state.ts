export type TaskViewFilter = "all" | "inbox" | "today" | "overdue" | "week" | "high" | "completed" | "pending" | "conflict" | "templates" | "trash";
export type TaskViewPriority = "all" | "high" | 0 | 1 | 2 | 3 | 4 | 5;
export type TaskViewStatus = "all" | "open" | "completed";

export interface TaskViewCriteria {
  search: string;
  filter: TaskViewFilter;
  project: string;
  tag: string;
  priority: TaskViewPriority;
  status: TaskViewStatus;
}

export interface TaskViewState extends TaskViewCriteria {
  scrollTop: number;
}

export interface SavedTaskView {
  id: string;
  name: string;
  criteria: TaskViewCriteria;
}

export interface WorkspaceViewState {
  taskView: TaskViewState;
  todayScrollTop: number;
  savedViews: SavedTaskView[];
}

export interface WorkspaceViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const filters = new Set<TaskViewFilter>(["all", "inbox", "today", "overdue", "week", "high", "completed", "pending", "conflict", "templates", "trash"]);

export function normalizeTaskViewCriteria(value: unknown): TaskViewCriteria {
  const candidate = record(value);
  return {
    search: textValue(candidate.search),
    filter: filters.has(candidate.filter as TaskViewFilter) ? candidate.filter as TaskViewFilter : "all",
    project: textValue(candidate.project),
    tag: textValue(candidate.tag),
    priority: candidate.priority === "high" || candidate.priority === 0 || candidate.priority === 1 || candidate.priority === 2 || candidate.priority === 3 || candidate.priority === 4 || candidate.priority === 5 ? candidate.priority : "all",
    status: candidate.status === "open" || candidate.status === "completed" ? candidate.status : "all",
  };
}

export function createWorkspaceViewState(): WorkspaceViewState {
  return { taskView: { ...normalizeTaskViewCriteria(null), scrollTop: 0 }, todayScrollTop: 0, savedViews: [] };
}

export function workspaceViewStorageKey(workspaceKey: string): string {
  return `taskbridge.workspace-view.v1:${encodeURIComponent(workspaceKey)}`;
}

export function readWorkspaceViewState(storage: WorkspaceViewStorage | null, workspaceKey: string | null): WorkspaceViewState {
  if (!storage || !workspaceKey) return createWorkspaceViewState();
  try {
    const raw = storage.getItem(workspaceViewStorageKey(workspaceKey));
    if (!raw) return createWorkspaceViewState();
    const envelope = record(JSON.parse(raw));
    if (envelope.version !== 1 || envelope.workspaceKey !== workspaceKey) return createWorkspaceViewState();
    return normalizeWorkspaceState(envelope);
  } catch {
    return createWorkspaceViewState();
  }
}

export function writeWorkspaceViewState(storage: WorkspaceViewStorage | null, workspaceKey: string | null, state: WorkspaceViewState): boolean {
  if (!storage || !workspaceKey) return false;
  try {
    storage.setItem(workspaceViewStorageKey(workspaceKey), JSON.stringify({
      version: 1,
      workspaceKey,
      ...normalizeWorkspaceState(state),
    }));
    return true;
  } catch {
    return false;
  }
}

export function createSavedTaskView(name: string, criteria: TaskViewCriteria, existing: readonly SavedTaskView[], id: string = crypto.randomUUID()): SavedTaskView {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName) throw new Error("view-name-empty");
  if (normalizedName.length > 60) throw new Error("view-name-too-long");
  if (existing.some((view) => view.name.toLowerCase() === normalizedName.toLowerCase())) throw new Error("view-name-duplicate");
  return { id, name: normalizedName, criteria: normalizeTaskViewCriteria(criteria) };
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// The caller supplies today's date in the user's display time zone. UTC arithmetic
// here advances calendar days, so DST changes cannot shift a week boundary.
export function calendarWeekBounds(today: string): { start: string; end: string } {
  if (!isValidCalendarDate(today)) throw new Error("invalid-calendar-date");
  const monday = new Date(`${today}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

type FilterableTask = Pick<TaskRecord, "title" | "content" | "project" | "tag" | "priority" | "listType" | "syncStatus" | "isTemplate" | "isDeleted">;
interface TaskViewDateContext {
  today: string;
  taskDate: string | null;
  completed: boolean;
  overdue: boolean;
  week?: { start: string; end: string };
}

export function matchesTaskView(task: FilterableTask, criteria: TaskViewCriteria, context: TaskViewDateContext): boolean {
  if (criteria.project && task.project !== criteria.project) return false;
  if (criteria.tag && task.tag !== criteria.tag) return false;
  if (criteria.status === "open" && context.completed) return false;
  if (criteria.status === "completed" && !context.completed) return false;
  if (criteria.priority !== "all" && (criteria.priority === "high" ? task.priority < 3 : task.priority !== criteria.priority)) return false;
  const keyword = criteria.search.trim().toLowerCase();
  if (keyword && !`${task.title} ${task.content ?? ""} ${task.tag ?? ""} ${task.project ?? ""}`.toLowerCase().includes(keyword)) return false;
  switch (criteria.filter) {
    case "inbox": return task.listType === "inbox" && !context.completed;
    case "today": return context.taskDate === context.today || task.listType === "today";
    case "overdue": return context.overdue;
    case "week": {
      const week = context.week ?? calendarWeekBounds(context.today);
      return Boolean(context.taskDate && context.taskDate >= week.start && context.taskDate <= week.end);
    }
    case "high": return task.priority >= 3 && !context.completed;
    case "completed": return context.completed;
    case "pending": return task.syncStatus !== "synced";
    case "conflict": return task.syncStatus === "conflict";
    case "templates": return task.isTemplate;
    case "trash": return task.isDeleted;
    default: return true;
  }
}

function normalizeWorkspaceState(value: unknown): WorkspaceViewState {
  const candidate = record(value);
  const taskView = record(candidate.taskView);
  const savedViews: SavedTaskView[] = [];
  const ids = new Set<string>();
  for (const item of Array.isArray(candidate.savedViews) ? candidate.savedViews : []) {
    const view = record(item);
    if (typeof view.id !== "string" || !view.id || ids.has(view.id) || typeof view.name !== "string") continue;
    try {
      savedViews.push(createSavedTaskView(view.name, normalizeTaskViewCriteria(view.criteria), savedViews, view.id));
      ids.add(view.id);
    } catch {
      // Invalid saved entries must not prevent valid views from being restored.
    }
  }
  return {
    taskView: { ...normalizeTaskViewCriteria(taskView), scrollTop: scrollPosition(taskView.scrollTop) },
    todayScrollTop: scrollPosition(candidate.todayScrollTop),
    savedViews,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function scrollPosition(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
