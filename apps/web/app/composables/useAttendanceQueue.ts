/**
 * The offline queue of the tap-to-mark screen — E12/S6.
 *
 * A mark the network refused waits here and is retried when the connection returns. localStorage,
 * not a cookie: the no-user-data-in-cookies rule exists because cookies travel with every request
 * and die silently at 4KB, and this queue is neither for the server's eyes nor small by contract.
 * Every storage touch is wrapped, per the standing rule — a private window or blocked site data
 * must degrade to "marks retry only while the tab lives", not to a crash.
 *
 * The pure parts (`upsertPending`) are separate from the storage IO so vitest can hold them.
 */

export interface PendingMark {
  sessionId: number;
  childId: number;
  present: boolean;
  queuedAt: number;
}

const STORAGE_KEY = "attendance-pending-marks-v1";

/**
 * Adds a mark to the list, replacing any earlier mark for the same child in the same class.
 *
 * Replacement, not append: the queue may hold "Ana present" from a dead spot and the teacher may
 * change their mind before the network returns. Sending both in order would be correct too — the
 * server upserts — but sending the stale one at all is a request the phone does not need to make.
 */
export function upsertPending(queue: PendingMark[], mark: PendingMark): PendingMark[] {
  const rest = queue.filter(
    (entry) => !(entry.sessionId === mark.sessionId && entry.childId === mark.childId)
  );
  return [...rest, mark];
}

export function readPendingMarks(): PendingMark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PendingMark =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as PendingMark).sessionId === "number" &&
        typeof (entry as PendingMark).childId === "number" &&
        typeof (entry as PendingMark).present === "boolean"
    );
  } catch {
    return [];
  }
}

export function writePendingMarks(queue: PendingMark[]): void {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
  } catch {
    // Storage refused (private window, quota, blocked site data): the queue lives in memory only,
    // and marks still retry while the tab is open. Nothing to tell the teacher mid-class.
  }
}
