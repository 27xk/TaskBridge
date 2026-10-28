import { watch, type Ref } from "vue";

export function useDismissibleDetails(
  menu: Readonly<Ref<HTMLDetailsElement | null>>,
  summary: Readonly<Ref<HTMLElement | null>>,
) {
  function close(restoreFocus = true): void {
    if (!menu.value?.open) return;
    menu.value.open = false;
    if (restoreFocus) summary.value?.focus({ preventScroll: true });
  }

  watch(menu, (element, _previous, onCleanup) => {
    if (!element) return;
    const details = element;
    const document = details.ownerDocument;

    function isInside(event: Event): boolean {
      if (event.composedPath().includes(details)) return true;
      const target = event.target as Node | null;
      return Boolean(target && typeof target.nodeType === "number" && details.contains(target));
    }

    function onPointerDown(event: Event): void {
      if (details.open && !isInside(event)) close(false);
    }

    function onFocusIn(event: Event): void {
      if (details.open && !isInside(event)) close(false);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (!details.open || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    });
  }, { immediate: true, flush: "sync" });

  return { close };
}
