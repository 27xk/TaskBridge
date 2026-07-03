import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export async function loadTsModule(relativePath) {
  const sourcePath = resolve(import.meta.dirname, "..", "..", relativePath);
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const tempDir = await mkdtemp(join(tmpdir(), "taskbridge-desktop-test-"));
  const tempFile = join(tempDir, `${crypto.randomUUID()}.mjs`);
  await writeFile(tempFile, compiled, "utf8");
  try {
    return await import(`file:///${tempFile.replace(/\\/g, "/")}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
