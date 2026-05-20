import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const source = readFileSync(new URL("../shared/quick-add-parser.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: 99,
    target: 7,
  },
}).outputText;

const tempDir = mkdtempSync(join(tmpdir(), "taskbridge-parser-"));
const tempFile = join(tempDir, "quick-add-parser.mjs");
writeFileSync(tempFile, compiled, "utf8");

try {
  const { parseQuickTask } = await import(`file:///${tempFile.replace(/\\/g, "/")}`);
  const now = new Date("2026-05-20T06:50:00.000Z");
  const failures = [];

  const laterToday = parseQuickTask("report 8", now, "Asia/Shanghai");
  if (laterToday.dueTime !== "2026-05-20T12:00:00.000Z") {
    failures.push(`bare 8 after noon should become today 20:00, got ${laterToday.dueTime}`);
  }

  const tomorrow = parseQuickTask("report 8", new Date("2026-05-20T13:00:00.000Z"), "Asia/Shanghai");
  if (tomorrow.dueTime !== "2026-05-21T00:00:00.000Z") {
    failures.push(`bare 8 after evening should become tomorrow 08:00, got ${tomorrow.dueTime}`);
  }

  const futureToday = parseQuickTask("report 16", now, "Asia/Shanghai");
  if (futureToday.dueTime !== "2026-05-20T08:00:00.000Z") {
    failures.push(`bare 16 should stay today 16:00, got ${futureToday.dueTime}`);
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("quick add parser check passed");
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
