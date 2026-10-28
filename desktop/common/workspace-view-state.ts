import type { TaskRecord } from "./task";
export type TaskViewFilter = "all" | "inbox" | "today" | "overdue" | "week" | "high" | "completed" | "pending" | "conflict" | "templates" | "trash";
export type TaskViewPriority = "all" | "high" | 0 | 1 | 2 | 3 | 4 | 5;
export type TaskViewStatus = "all" | "open" | "completed";
export type TaskViewList = "inbox" | "today" | "overdue" | "week" | "pending" | "conflict" | "templates" | "trash";
export type TaskViewSelectedStatus = Exclude<TaskViewStatus, "all">;
export type TaskViewSelectedPriority = Exclude<TaskViewPriority, "all">;
export type TaskViewSortMode = "time" | "category";

export interface TaskViewCriteria {
  search: string;
  // Legacy fields remain readable for version-one saved views and shortcuts.
  // Arrays are the authoritative filters; empty arrays impose no restriction.
  filter: TaskViewFilter;
  project: string;
  tag: string;
  priority: TaskViewPriority;
  status: TaskViewStatus;
  lists: TaskViewList[];
  statuses: TaskViewSelectedStatus[];
  categories: string[];
  projects: string[];
  priorities: TaskViewSelectedPriority[];
  sortMode: TaskViewSortMode;
}

export type TaskViewSelectionKey = "lists" | "statuses" | "categories" | "projects" | "priorities";
export type TaskViewSelectionValue<K extends TaskViewSelectionKey> = TaskViewCriteria[K][number];

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
const lists = new Set<TaskViewList>(["inbox", "today", "overdue", "week", "pending", "conflict", "templates", "trash"]);

export function normalizeTaskViewCriteria(value: unknown): TaskViewCriteria {
  const candidate = record(value);
  const filter = filters.has(candidate.filter as TaskViewFilter) ? candidate.filter as TaskViewFilter : "all";
  const priority = selectedPriority(candidate.priority) ? candidate.priority : "all";
  const status = selectedStatus(candidate.status) ? candidate.status : "all";
  const projects = selection(candidate.projects, textValue(candidate.project) ? [textValue(candidate.project)] : [], stringValue);
  const categories = selection(candidate.categories, textValue(candidate.tag) ? [textValue(candidate.tag)] : [], stringValue);
  const selectedLists = selection(candidate.lists, lists.has(filter as TaskViewList) ? [filter as TaskViewList] : [], (item): item is TaskViewList => lists.has(item as TaskViewList));
  const priorities = selection<TaskViewSelectedPriority>(candidate.priorities, priority !== "all" ? [priority] : filter === "high" ? ["high"] : [], selectedPriority);
  const statuses = selection<TaskViewSelectedStatus>(candidate.statuses, status !== "all" ? [status] : filter === "completed" ? ["completed"] : filter === "inbox" || filter === "high" ? ["open"] : [], selectedStatus);
  return {
    search: textValue(candidate.search),
    filter,
    project: projects.length === 1 ? projects[0] : "",
    tag: categories.length === 1 ? categories[0] : "",
    priority: priorities.length === 1 ? priorities[0] : "all",
    status: statuses.length === 1 ? statuses[0] : "all",
    lists: selectedLists,
    statuses,
    categories,
    projects,
    priorities,
    sortMode: candidate.sortMode === "category" ? "category" : "time",
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

type FilterableTask = Pick<TaskRecord, "title" | "project" | "tag" | "priority" | "listType" | "syncStatus" | "isTemplate" | "isDeleted"> & { content?: string | null };
interface TaskViewDateContext {
  today: string;
  taskDate: string | null;
  completed: boolean;
  overdue: boolean;
  week?: { start: string; end: string };
}

export function matchesTaskView(task: FilterableTask, criteria: TaskViewCriteria, context: TaskViewDateContext): boolean {
  if (criteria.projects.length && !criteria.projects.includes(task.project ?? "")) return false;
  if (criteria.categories.length && !criteria.categories.includes(task.tag ?? "")) return false;
  if (criteria.statuses.length && !criteria.statuses.includes(context.completed ? "completed" : "open")) return false;
  if (criteria.priorities.length && !criteria.priorities.some((priority) => priority === "high" ? task.priority >= 3 : task.priority === priority)) return false;
  const keyword = criteria.search.trim().toLowerCase();
  if (keyword && !`${task.title} ${task.content ?? ""} ${task.tag ?? ""} ${task.project ?? ""}`.toLowerCase().includes(keyword)) return false;
  if (!criteria.lists.length) return !task.isDeleted;
  return criteria.lists.some((list) => matchesList(task, list, context));
}

function matchesList(task: FilterableTask, list: TaskViewList, context: TaskViewDateContext): boolean {
  if (list === "trash") return task.isDeleted;
  if (task.isDeleted) return false;
  switch (list) {
    case "inbox": return task.listType === "inbox";
    case "today": return context.taskDate === context.today || task.listType === "today";
    case "overdue": return context.overdue;
    case "week": {
      const week = context.week ?? calendarWeekBounds(context.today);
      return Boolean(context.taskDate && context.taskDate >= week.start && context.taskDate <= week.end);
    }
    case "pending": return task.syncStatus !== "synced";
    case "conflict": return task.syncStatus === "conflict";
    case "templates": return task.isTemplate;
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

function stringValue(value: unknown): value is string {
  return typeof value === "string";
}

function selectedStatus(value: unknown): value is TaskViewSelectedStatus {
  return value === "open" || value === "completed";
}

function selectedPriority(value: unknown): value is TaskViewSelectedPriority {
  return value === "high" || value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function selection<T>(value: unknown, legacy: readonly T[], valid: (item: unknown) => item is T): T[] {
  return [...new Set(Array.isArray(value) ? value.filter(valid) : legacy)];
}

function scrollPosition(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
