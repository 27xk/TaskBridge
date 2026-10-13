import { pathToFileURL } from "node:url";

export function validateReleaseEndpoints(environment = process.env) {
  for (const [name, protocols, suffix] of [
    ["TASKBRIDGE_BASE_URL", ["http:", "https:"], "/api/v1"],
    ["TASKBRIDGE_WS_URL", ["ws:", "wss:"], "/ws/sync"],
  ]) {
    const value = environment[name]?.trim();
    let url;
    try { url = new URL(value); } catch { /* Report the parameter, without leaking its value. */ }
    if (!url || !protocols.includes(url.protocol) || !url.hostname ||
        url.hostname.endsWith(".invalid") || url.username || url.password || url.search || url.hash ||
        !url.pathname.replace(/\/+$/, "").endsWith(suffix)) {
      throw new Error(`${name} must be a non-placeholder ${protocols.join(" or ")} URL ending in ${suffix}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateReleaseEndpoints();
  console.log("Release endpoints are configured.");
}
