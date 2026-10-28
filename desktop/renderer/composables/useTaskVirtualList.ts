import type { TaskListItem } from "../../common/task";
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from "vue";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/vue-virtual";

// Weak keys preserve measurements across view remounts without retaining removed tasks/workspaces.
const measuredTasks = new WeakMap<TaskListItem, { width: number; density: string; height: number }>();
const controls = 'button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]';

export function useTaskVirtualList(
  element: Ref<HTMLElement | null>,
  tasks: () => TaskListItem[],
  density: () => string,
) {
  const scrollParent = shallowRef<HTMLElement | null>(null);
  const scrollMargin = shallowRef(0);
  const width = shallowRef(0);
  const focusedId = shallowRef<string | null>(null);
  let observer: ResizeObserver | null = null;
  let layoutFrame = 0;
  let disposed = false;

  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(computed(() => {
    const focused = focusedId.value ? tasks().findIndex((task) => task.localId === focusedId.value) : -1;
    const parent = scrollParent.value;
    return {
    count: tasks().length,
    getScrollElement: () => parent,
    getItemKey: (index: number) => tasks()[index].localId,
    initialRect: { width: 0, height: window.innerHeight || 800 },
    initialOffset: () => scrollParent.value?.scrollTop ?? 0,
    scrollMargin: scrollMargin.value,
    overscan: 5,
    useAnimationFrameWithResizeObserver: true,
    estimateSize: (index: number) => {
      const task = tasks()[index];
      const cached = measuredTasks.get(task);
      if (cached && cached.width === width.value && cached.density === density()) return cached.height;
      return task.syncStatus === "conflict" ? 310 : ("content" in task ? task.content : task.contentPreview) ? 108 : 76;
    },
    measureElement: (node: HTMLElement, entry?: ResizeObserverEntry) => {
      const height = entry?.borderBoxSize?.[0]?.blockSize ?? node.getBoundingClientRect().height;
      const task = tasks()[Number(node.dataset.index)];
      if (task && height > 0) measuredTasks.set(task, { width: width.value, density: density(), height });
      return height;
    },
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (focused >= 0 && !indexes.includes(focused)) indexes.push(focused);
      return indexes.sort((a, b) => a - b);
    },
    };
  }));
  const rows = computed(() => virtualizer.value.getVirtualItems());
  const totalHeight = computed(() => virtualizer.value.getTotalSize());

  function updateLayout(): void {
    layoutFrame = 0;
    const list = element.value;
    const parent = scrollParent.value;
    if (!list || !parent) return;
    const rect = list.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    scrollMargin.value = rect.top - parentRect.top + parent.scrollTop - parent.clientTop;
    const nextWidth = Math.round(rect.width);
    if (width.value !== nextWidth) {
      width.value = nextWidth;
      virtualizer.value.measure();
    }
  }

  function scheduleLayout(): void {
    if (!layoutFrame) layoutFrame = window.requestAnimationFrame(updateLayout);
  }

  function bindListElement(): void {
    observer?.disconnect();
    scrollParent.value = element.value?.closest<HTMLElement>(".workspace-main") ?? null;
    if (!element.value || !scrollParent.value) {
      scrollMargin.value = 0;
      return;
    }
    updateLayout();
    observer ??= new ResizeObserver(scheduleLayout);
    observer.observe(scrollParent.value);
    const list = element.value?.closest(".task-list");
    if (list) observer.observe(list);
  }
  onMounted(bindListElement);
  watch(element, bindListElement, { flush: "post" });
  watch(tasks, () => { void nextTick(updateLayout); }, { flush: "post" });
  watch(density, () => { virtualizer.value.measure(); scheduleLayout(); });
  onBeforeUnmount(() => {
    disposed = true;
    observer?.disconnect();
    if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
  });

  function measure(node: unknown): void {
    if (node instanceof HTMLElement) virtualizer.value.measureElement(node);
  }

  function onFocusIn(event: FocusEvent): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-task-id]");
    focusedId.value = row?.dataset.taskId ?? null;
  }

  function onFocusOut(): void {
    void nextTick(() => {
      if (!element.value?.contains(document.activeElement)) focusedId.value = null;
    });
  }

  async function focusIndex(index: number, lastControl = false, preferTitle = true): Promise<void> {
    const task = tasks()[index];
    if (!task) return;
    focusedId.value = task.localId;
    virtualizer.value.scrollToIndex(index, { align: "auto" });
    await nextTick();
    if (disposed) return;
    const row = element.value?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!row) return;
    const targets = Array.from(row.querySelectorAll<HTMLElement>(controls));
    const target = lastControl ? targets[targets.length - 1] : preferTitle ? row.querySelector<HTMLElement>(".task-edit-trigger") ?? targets[0] : targets[0];
    (target ?? row).focus({ preventScroll: true });
    virtualizer.value.scrollToIndex(index, { align: "auto" });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-index]");
    if (!row || target.closest('[role="menu"]')) return;
    const index = Number(row.dataset.index);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = index + 1;
    if (event.key === "ArrowUp") next = index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tasks().length - 1;
    if (event.key === "Tab") {
      const targets = Array.from(row.querySelectorAll<HTMLElement>(controls));
      if (!event.shiftKey && target === targets[targets.length - 1]) next = index + 1;
      if (event.shiftKey && target === targets[0]) next = index - 1;
    }
    if (next === null || next < 0 || next >= tasks().length) return;
    event.preventDefault();
    void focusIndex(next, event.key === "Tab" && event.shiftKey, event.key !== "Tab");
  }

  return { rows, totalHeight, scrollMargin, measure, onFocusIn, onFocusOut, onKeyDown };
}
