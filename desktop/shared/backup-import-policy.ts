import type { AppLanguage } from "../src/i18n";

export interface BackupImportUndoResult {
  undoneCount: number;
  skippedChangedCount: number;
}

export function canUndoImportedBackupTask(currentUpdatedAt: string, importedUpdatedAt: string): boolean {
  return currentUpdatedAt.trim() !== "" && currentUpdatedAt === importedUpdatedAt;
}

export function getBackupImportUndoConfirmationMessage(
  count: number,
  language: AppLanguage = "zh-CN",
): string {
  if (language === "en-US") {
    return `Undo ${count} imported tasks from the most recent import? Tasks edited after import will be kept.`;
  }
  return `撤销最近一次导入的 ${count} 条任务？导入后编辑过的任务会保留。`;
}

export function getBackupImportUndoResultMessage(
  result: BackupImportUndoResult,
  language: AppLanguage = "zh-CN",
): string {
  if (language === "en-US") {
    const base = result.undoneCount > 0
      ? `Undid ${result.undoneCount} imported tasks.`
      : "No imported tasks could be undone.";
    if (result.skippedChangedCount <= 0) return base;
    const noun = result.skippedChangedCount === 1 ? "task was" : "tasks were";
    return `${base} ${result.skippedChangedCount} changed ${noun} kept.`;
  }

  const base = result.undoneCount > 0
    ? `已撤销 ${result.undoneCount} 条导入任务。`
    : "没有可撤销的导入任务。";
  if (result.skippedChangedCount <= 0) return base;
  return `${base} ${result.skippedChangedCount} 条导入后修改过的任务已保留。`;
}
