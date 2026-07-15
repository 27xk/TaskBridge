export type WorkspaceSyncStatus = "idle" | "syncing" | "offline" | "error" | "synced";

export type WorkspaceIndicator = "ready" | "working" | "offline" | "attention";

export type WorkspaceBanner = "none" | "offline" | "attention";

export interface WorkspaceDiagnosticsSummary {
  pendingQueueCount: number;
  exhaustedQueueCount: number;
  failedCount: number;
  conflictCount: number;
}

export interface WorkspaceStatusPresentation {
  indicator: WorkspaceIndicator;
  banner: WorkspaceBanner;
  issueCount: number;
}

export function deriveWorkspaceStatus(
  status: WorkspaceSyncStatus,
  diagnostics: WorkspaceDiagnosticsSummary,
): WorkspaceStatusPresentation {
  if (status === "idle") {
    return { indicator: "ready", banner: "none", issueCount: 0 };
  }

  const issueCount = diagnostics.pendingQueueCount
    + diagnostics.exhaustedQueueCount
    + diagnostics.failedCount
    + diagnostics.conflictCount;
  const hasDiagnosticIssue = diagnostics.exhaustedQueueCount > 0
    || diagnostics.failedCount > 0
    || diagnostics.conflictCount > 0;

  if (status === "error" || hasDiagnosticIssue) {
    return { indicator: "attention", banner: "attention", issueCount };
  }
  if (status === "offline") {
    return { indicator: "offline", banner: "offline", issueCount };
  }
  if (status === "syncing") {
    return { indicator: "working", banner: "none", issueCount };
  }
  return { indicator: "ready", banner: "none", issueCount };
}
