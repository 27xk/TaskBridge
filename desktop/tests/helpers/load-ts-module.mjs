import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export async function loadTsModule(relativePath, options = {}) {
  const compiledModule = await compileTsModule(relativePath, options);
  try {
    return await import(`file:///${compiledModule.modulePath.replace(/\\/g, "/")}`);
  } finally {
    await compiledModule.cleanup();
  }
}

export async function compileTsModule(relativePath, options = {}) {
  const desktopRoot = resolve(import.meta.dirname, "..", "..");
  const sourcePath = resolve(desktopRoot, relativePath);
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const tempParent = options.resolvePackagesFromProject
    ? resolve(desktopRoot, ".test-modules")
    : tmpdir();
  await mkdir(tempParent, { recursive: true });
  const tempDir = await mkdtemp(join(tempParent, "taskbridge-desktop-test-"));
  const tempFile = join(tempDir, `${crypto.randomUUID()}.mjs`);
  await writeFile(tempFile, compiled, "utf8");
  return {
    modulePath: tempFile,
    tempDir,
    cleanup: () => rm(tempDir, { recursive: true, force: true }),
  };
}
