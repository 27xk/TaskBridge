import { nextTick, onBeforeUnmount, shallowRef, type Ref } from "vue";

let dismissActiveMenu: ((restoreFocus?: boolean) => void) | null = null;

export function useTaskMenu(trigger: Ref<HTMLButtonElement | null>, panel: Ref<HTMLElement | null>) {
  const open = shallowRef(false);
  const position = shallowRef({ top: "0px", left: "0px", right: "auto" });

  function close(restoreFocus = true): void {
    if (!open.value) return;
    open.value = false;
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("focusin", onFocusIn);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    if (dismissActiveMenu === close) dismissActiveMenu = null;
    if (restoreFocus && trigger.value?.isConnected) trigger.value.focus({ preventScroll: true });
  }

  async function toggle(): Promise<void> {
    if (open.value) { close(); return; }
    dismissActiveMenu?.(false);
    dismissActiveMenu = close;
    open.value = true;
    await nextTick();
    if (!open.value || !trigger.value || !panel.value) return;
    const anchor = trigger.value.getBoundingClientRect();
    const menu = panel.value.getBoundingClientRect();
    const below = anchor.bottom + 6;
    const top = below + menu.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - menu.height - 6);
    const left = Math.max(8, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 8));
    position.value = { top: `${top}px`, left: `${left}px`, right: "auto" };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    panel.value.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }

  function isInside(node: Node | null): boolean {
    return Boolean(node && (trigger.value?.contains(node) || panel.value?.contains(node)));
  }
  function onPointerDown(event: PointerEvent): void { if (!isInside(event.target as Node)) close(); }
  function onFocusIn(event: FocusEvent): void { if (!isInside(event.target as Node)) close(false); }
  function onScroll(event: Event): void { if (!panel.value?.contains(event.target as Node)) close(); }
  function onResize(): void { close(); }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === "Tab") { close(); return; }
    const items = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let index: number;
    if (event.key === "ArrowDown") index = (current + 1) % items.length;
    else if (event.key === "ArrowUp") index = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = items.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    items[index].focus();
  }

  onBeforeUnmount(() => close(false));
  return { open, position, toggle, close, onKeyDown };
}
