const WEB_VERSION = "0.1.8";
const CACHE_NAME = `taskbridge-web-shell-v${WEB_VERSION}`;
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./local-trial.html",
  "./self-hosting.html",
  "./styles.css",
  `./app.js?v=${WEB_VERSION}`,
  `./startup.js?v=${WEB_VERSION}`,
  `./guide-language.js?v=${WEB_VERSION}`,
  `./offline-core.js?v=${WEB_VERSION}`,
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("taskbridge-web-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (
        (await caches.match(request)) || caches.match("./index.html")
      )),
    );
    return;
  }
  if (isVersionedShellAssetRequest(request)) {
    event.respondWith(
      fetchFreshAndCache(request).catch(() => caches.match(cacheKeyForRequest(request))),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openNotificationTarget(event.notification.data?.url));
});

async function openNotificationTarget(rawUrl) {
  const fallbackUrl = new URL("./", self.registration.scope);
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl || fallbackUrl, self.registration.scope);
  } catch {
    targetUrl = fallbackUrl;
  }
  if (targetUrl.origin !== self.location.origin) {
    targetUrl = fallbackUrl;
  }

  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const existingClient = windowClients.find((client) => {
    try {
      return new URL(client.url).origin === targetUrl.origin;
    } catch {
      return false;
    }
  });
  if (existingClient) {
    if (typeof existingClient.navigate === "function") {
      await existingClient.navigate(targetUrl.toString());
    }
    return existingClient.focus();
  }
  return self.clients.openWindow(targetUrl.toString());
}

function isVersionedShellAssetRequest(request) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("v") === WEB_VERSION &&
    ["/app.js", "/startup.js", "/guide-language.js", "/offline-core.js"].some((path) =>
      url.pathname.endsWith(path),
    )
  );
}

function cacheKeyForRequest(request) {
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length)
    : url.pathname.replace(/^\//, "");
  return `./${relativePath}${url.search}`;
}

async function fetchFreshAndCache(request) {
  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  await cache.put(cacheKeyForRequest(request), response.clone());
  return response;
}
