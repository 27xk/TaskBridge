import { bridge } from "./sqlite";

export async function listSyncQueue(limit = 100): Promise<SyncQueueRecord[]> {
  return bridge().db.listQueue(limit);
}

export async function enqueueChange(change: SyncQueueRecord): Promise<number> {
  return bridge().db.enqueueChange(change);
}

export async function removeQueueItem(id: number): Promise<void> {
  return bridge().db.removeQueueItem(id);
}

export async function removeQueueByLocalId(localId: string): Promise<void> {
  return bridge().db.removeQueueByLocalId(localId);
}

export async function incrementQueueAttempt(id: number): Promise<void> {
  return bridge().db.incrementAttempt(id);
}
