export type BackupImportErrorCode =
  | "file_too_large"
  | "invalid_json"
  | "unsupported_format"
  | "missing_tasks"
  | "too_many_tasks";

export interface BackupImportError {
  code: BackupImportErrorCode;
  message: string;
}

export interface BackupImportResult {
  canceled: boolean;
  importedCount?: number;
  scannedCount?: number;
  skippedCount?: number;
  importedLocalIds?: string[];
  error?: BackupImportError;
}

export interface BackupImportPreview {
  canceled: boolean;
  filePath?: string;
  importableCount?: number;
  scannedCount?: number;
  skippedCount?: number;
  error?: BackupImportError;
}

export interface BackupImportUndoItem {
  localId: string;
  importedUpdatedAt: string;
}

export interface BackupImportUndoResult {
  undoneCount: number;
  skippedChangedCount: number;
}
