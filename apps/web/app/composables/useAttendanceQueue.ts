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

/**
 * How long to wait before the next automatic retry, given how many have already failed.
 *
 * The queue used to drain on two events only: the screen opening, and the browser firing `online`.
 * Neither fires on the connection a classroom actually has — one bar of signal, where requests
 * time out but `navigator.onLine` never goes false. The banner's promise that marks "se retrimit
 * singure" was then true only for a connection that had properly dropped, and a teacher who put
 * the phone in a pocket had no reason to believe otherwise.
 *
 * Doubling from 5s, capped at a minute: the cap matters more than the curve, because the queue
 * survives for as long as the tab does and a lesson is ninety minutes — an uncapped backoff would
 * quietly stop trying somewhere in the middle of the class it was meant to cover.
 */
export function retryDelayMs(failedAttempts: number): number {
  const base = 5000;
  const cap = 60000;
  const step = Math.max(0, failedAttempts);
  return Math.min(cap, base * 2 ** step);
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
