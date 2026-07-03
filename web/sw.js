const WEB_VERSION = "0.1.7";
const CACHE_NAME = `taskbridge-web-shell-v${WEB_VERSION}`;
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./local-trial.html",
  "./self-hosting.html",
  "./styles.css",
  `./app.js?v=${WEB_VERSION}`,
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
      fetch(request).catch(() => caches.match("./index.html")),
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

function isVersionedShellAssetRequest(request) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("v") === WEB_VERSION &&
    (url.pathname.endsWith("/app.js") || url.pathname.endsWith("/offline-core.js"))
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
