import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function workspaceRoot(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

export function workspacePaths(metaUrl) {
  const desktopRoot = workspaceRoot(metaUrl);
  return {
    desktopRoot,
    repoRoot: resolve(desktopRoot, ".."),
  };
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
