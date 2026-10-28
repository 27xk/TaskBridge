import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(app.getAppPath(), "build/icon.ico"),
    join(__dirname, "../../build/icon.ico"),
    join(process.cwd(), "build/icon.ico"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}
