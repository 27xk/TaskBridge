import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KiB = 1024;
const MiB = KiB * KiB;
export const DESKTOP_ARTIFACT_LIMITS = Object.freeze({ main: 160 * KiB, preload: 16 * KiB, rendererJs: 600 * KiB,
  rendererCss: 200 * KiB, buildTotal: MiB, asar: 8 * MiB, unpacked: 400 * MiB, installer: 140 * MiB });

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return entry.isFile() ? [{ path, bytes: statSync(path).size }] : [];
  });
}

function within(name, bytes, limit) {
  assert.ok(bytes > 0, `${name} must contain a nonempty artifact`);
  assert.ok(bytes <= limit, `${name} exceeded ${limit} bytes: ${bytes}`);
  return bytes;
}

export function checkDesktopArtifactBudget({ buildDirectory, unpackedDirectory, installer } = {}) {
  const result = {};
  if (buildDirectory) {
    const files = filesUnder(buildDirectory);
    const sum = predicate => files.filter(predicate).reduce((total, file) => total + file.bytes, 0);
    assert.ok(files.some(file => basename(file.path) === "index.html"), "renderer index.html is missing");
    assert.ok(!files.some(file => file.path.endsWith(".map")), "production artifacts must not include sourcemaps");
    result.mainBytes = within("main bundle", statSync(join(buildDirectory, "main/index.js")).size, DESKTOP_ARTIFACT_LIMITS.main);
    result.preloadBytes = within("preload bundle", statSync(join(buildDirectory, "preload/index.cjs")).size, DESKTOP_ARTIFACT_LIMITS.preload);
    const rendererPrefix = resolve(buildDirectory, "renderer");
    result.rendererJsBytes = within("renderer JavaScript", sum(file => file.path.startsWith(rendererPrefix) && file.path.endsWith(".js")), DESKTOP_ARTIFACT_LIMITS.rendererJs);
    result.rendererCssBytes = within("renderer CSS", sum(file => file.path.startsWith(rendererPrefix) && file.path.endsWith(".css")), DESKTOP_ARTIFACT_LIMITS.rendererCss);
    result.buildBytes = within("compiled application", sum(() => true), DESKTOP_ARTIFACT_LIMITS.buildTotal);
  }
  if (unpackedDirectory) {
    result.asarBytes = within("app.asar", statSync(join(unpackedDirectory, "resources/app.asar")).size, DESKTOP_ARTIFACT_LIMITS.asar);
    result.unpackedBytes = within("unpacked application", filesUnder(unpackedDirectory).reduce((total, file) => total + file.bytes, 0), DESKTOP_ARTIFACT_LIMITS.unpacked);
  }
  if (installer) result.installerBytes = within("Windows installer", statSync(installer).size, DESKTOP_ARTIFACT_LIMITS.installer);
  assert.ok(Object.keys(result).length, "select at least one artifact to check");
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : resolve(process.argv[index + 1]); };
  console.log(JSON.stringify(checkDesktopArtifactBudget({
    buildDirectory: option("--build-dir") ?? resolve(import.meta.dirname, "../out"),
    unpackedDirectory: option("--unpacked-dir"), installer: option("--installer"),
  }), null, 2));
}
