import { onMounted, onScopeDispose, shallowRef } from "vue";

/** Keep relative dates current while a floating renderer remains open overnight. */
export function usePresentationClock() {
  const now = shallowRef(new Date());
  let timer: number | undefined;
  const refresh = () => { now.value = new Date(); };

  onMounted(() => {
    refresh();
    timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
  });

  onScopeDispose(() => {
    if (timer !== undefined) window.clearInterval(timer);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
  });

  return now;
}
