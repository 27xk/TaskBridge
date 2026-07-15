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

  const actionableIssueCount = diagnostics.exhaustedQueueCount
    + diagnostics.failedCount
    + diagnostics.conflictCount;
  const hasDiagnosticIssue = actionableIssueCount > 0;

  if (status === "error" || hasDiagnosticIssue) {
    return {
      indicator: "attention",
      banner: "attention",
      issueCount: actionableIssueCount,
    };
  }
  if (status === "offline") {
    return {
      indicator: "offline",
      banner: "offline",
      issueCount: diagnostics.pendingQueueCount,
    };
  }
  if (status === "syncing") {
    return { indicator: "working", banner: "none", issueCount: 0 };
  }
  return { indicator: "ready", banner: "none", issueCount: 0 };
}
