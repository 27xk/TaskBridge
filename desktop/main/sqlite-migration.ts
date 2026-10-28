import Database from "better-sqlite3";
import { existsSync, renameSync, rmSync } from "node:fs";

export function migrateSqliteDatabase(sourcePath: string, destinationPath: string): boolean {
  if (existsSync(destinationPath)) return false;
  const temporaryPath = `${destinationPath}.migrating`;
  rmSync(temporaryPath, { force: true });

  try {
    const source = new Database(sourcePath, { fileMustExist: true });
    try {
      source.prepare("VACUUM INTO ?").run(temporaryPath);
    } finally {
      source.close();
    }

    const migrated = new Database(temporaryPath, { readonly: true, fileMustExist: true });
    try {
      if (migrated.pragma("quick_check", { simple: true }) !== "ok") {
        throw new Error("Migrated SQLite database failed integrity validation");
      }
    } finally {
      migrated.close();
    }

    if (existsSync(destinationPath)) {
      rmSync(temporaryPath, { force: true });
      return false;
    }
    renameSync(temporaryPath, destinationPath);
    return true;
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}
