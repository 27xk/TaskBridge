import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(repoRoot, "web");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = normalize(join(webRoot, decodeURIComponent(requestedPath)));
    const relativePath = relative(webRoot, filePath);
    if (relativePath.startsWith("..") || relativePath === "" || /^[A-Za-z]:/.test(relativePath)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

try {
  await new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object", "web smoke server must bind to a random port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const index = await fetchText(`${baseUrl}/index.html`);
  assert.match(index, /<title>TaskBridge<\/title>/, "web index must expose the product title");
  assert.match(index, /<section id="authScreen"/, "web index must expose the auth screen");
  assert.match(index, /<section id="appScreen" class="workspace" hidden>/, "web index must keep the app screen hidden before auth");
  assert.doesNotMatch(index, /http-equiv="Content-Security-Policy"/, "web index must not embed deployment CSP");

  for (const asset of [
    "/local-trial.html",
    "/self-hosting.html",
    "/styles.css",
    "/app.js",
    "/offline-core.js",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
    "/manifest.webmanifest",
    "/sw.js",
  ]) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status, 200, `${asset} must be served over HTTP`);
    assert.ok((await response.text()).length > 0, `${asset} must not be empty`);
  }

  const manifest = JSON.parse(await fetchText(`${baseUrl}/manifest.webmanifest`));
  assert.equal(manifest.name, "TaskBridge Web", "web manifest must expose the app name");

  console.log("web client HTTP smoke passed");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

async function fetchText(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url} must return 200`);
  return response.text();
}
