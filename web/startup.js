window.taskBridgeWebReady ??= false;

function showStartupFallback() {
  if (window.taskBridgeWebReady) return;
  const panel = document.getElementById("startupFallback");
  if (panel) panel.hidden = false;
}

function reloadPage() {
  window.location.reload();
}

async function clearOfflineCacheAndReload() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  reloadPage();
}

document.getElementById("reloadStartupButton")?.addEventListener("click", reloadPage);
document.getElementById("clearStartupCacheButton")?.addEventListener("click", () => {
  void clearOfflineCacheAndReload();
});
window.setTimeout(showStartupFallback, 4000);
