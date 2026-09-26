import {
  readPendingMarks,
  retryDelayMs,
  upsertPending,
  writePendingMarks,
  type PendingMark,
} from "~/composables/useAttendanceQueue";

/**
 * The tap-and-queue logic of the phone register — E12/S6, pulled out of `azi.vue` so that a plain
 * vitest can hold it (the review of 26 September 2026 found three ways it lost a mark, and each
 * needed the whole page compiled to see).
 *
 * `useAttendanceQueue` holds the storage and the pure rules; this holds the moving parts: one tap,
 * the retry pass, the timer between passes. Three rules it keeps, each the fix of one of those
 * findings:
 *
 * - **A pass removes only what it settled.** It used to end by writing back the list it had been
 *   given, so a tap that failed *while* the pass was running — the normal case on one bar of signal —
 *   was wiped from the queue and from storage, with its row still showing the cloud icon.
 * - **A tap that got through is newer than anything queued for that child.** It used to leave the
 *   older queued mark in place, and the next retry — minutes later, or days later, since the queue
 *   lives in localStorage and drains on every opening of the screen — wrote it over the newer one.
 *   Requests for one child also go out one at a time, so the older one cannot overtake the newer on
 *   the wire either.
 */

export type MarkRequest = Pick<PendingMark, "sessionId" | "childId" | "present">;

/** What happened to a request: refused on its merits, or not delivered yet. */
export type Failure = "refused" | "undelivered";

/**
 * How a failed request is read: a 4xx is the server saying no — a cancelled class, a child that is
 * gone — and retrying would not change its mind. Anything else waits in the queue.
 */
export function classifyFailure(err: unknown): Failure {
  const status =
    (err as { status?: unknown; statusCode?: unknown } | null)?.status ??
    (err as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) return "refused";
  return "undelivered";
}

export type TapResult =
  { outcome: "saved" } | { outcome: "queued" } | { outcome: "refused"; error: unknown };

export interface MarkQueueOptions {
  /** Sends one mark. The server's upsert is idempotent, so resending is always safe. */
  send: (mark: MarkRequest) => Promise<unknown>;
  /** A queued mark reached the server. */
  onDelivered?: (mark: PendingMark) => void;
  /** The server refused a queued mark on its merits; it has left the queue. */
  onRefused?: (mark: PendingMark, error: unknown) => void;
  now?: () => number;
}

const keyOf = (mark: MarkRequest) => `${mark.sessionId}:${mark.childId}`;

export function useMarkQueue(options: MarkQueueOptions) {
  const now = options.now ?? Date.now;
  const pending = ref<PendingMark[]>([]);
  const flushing = ref(false);
  /** How many passes in a row have come back with something undelivered; drives the backoff. */
  const failedFlushes = ref(0);
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** The request in the air per child and class — at most one, so they land in the order made. */
  const inFlight = new Map<string, Promise<unknown>>();

  const persist = () => writePendingMarks(pending.value);

  /** Reads what an earlier visit left behind. */
  const load = () => {
    pending.value = readPendingMarks();
  };

  const cancelRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  /** Keeps exactly one retry waiting, so a tap cannot stack a second timer on the first. */
  const scheduleRetry = () => {
    cancelRetry();
    if (pending.value.length === 0) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flush();
    }, retryDelayMs(failedFlushes.value));
  };

  /**
   * Sends one mark after whatever is still in the air for the same child and class.
   * `stillWanted` is asked once the line is clear: a queued mark a newer tap has replaced meanwhile
   * is not sent at all — `false` comes back instead.
   */
  const deliver = async (mark: MarkRequest, stillWanted?: () => boolean): Promise<boolean> => {
    const key = keyOf(mark);
    const ahead = inFlight.get(key);
    const request = (async () => {
      if (ahead) await ahead;
      if (stillWanted && !stillWanted()) return false;
      await options.send(mark);
      return true;
    })();
    const settled = request.then(
      () => undefined,
      () => undefined
    );
    inFlight.set(key, settled);
    try {
      return await request;
    } finally {
      if (inFlight.get(key) === settled) inFlight.delete(key);
    }
  };

  /**
   * One tap. Returns what the screen should show; the screen has already flipped the button.
   */
  const tap = async (mark: MarkRequest): Promise<TapResult> => {
    try {
      await deliver(mark);
    } catch (error: unknown) {
      const failure = classifyFailure(error);
      if (failure === "refused") return { outcome: "refused", error };
      pending.value = upsertPending(pending.value, { ...mark, queuedAt: now() });
      persist();
      scheduleRetry();
      return { outcome: "queued" };
    }
    // What the server holds now is this tap. An older mark for the same child still in the queue is
    // a statement the teacher has taken back, and sending it later would overwrite this one.
    const key = keyOf(mark);
    const rest = pending.value.filter((entry) => keyOf(entry) !== key);
    if (rest.length !== pending.value.length) {
      pending.value = rest;
      persist();
      if (rest.length === 0) cancelRetry();
    }
    return { outcome: "saved" };
  };

  /**
   * Retries the queue in order. Whatever this pass delivered or saw refused leaves the queue;
   * everything else — including anything tapped while the pass ran — stays, and is retried.
   */
  const flush = async () => {
    if (flushing.value || pending.value.length === 0) return;
    flushing.value = true;
    const batch = [...pending.value];
    const settled = new Set<PendingMark>();
    let undelivered = false;

    try {
      for (const queued of batch) {
        try {
          // Identity, not equality: a newer tap for the same child replaces this object in the queue.
          const sent = await deliver(queued, () => pending.value.includes(queued));
          if (!sent) continue;
          settled.add(queued);
          options.onDelivered?.(queued);
        } catch (error: unknown) {
          const failure = classifyFailure(error);
          if (failure === "refused") {
            // The server said no — retrying forever would not change its mind.
            settled.add(queued);
            options.onRefused?.(queued, error);
            continue;
          }
          undelivered = true;
        }
      }
    } finally {
      pending.value = pending.value.filter((entry) => !settled.has(entry));
      persist();
      flushing.value = false;
    }

    // Whatever is still here is this screen's to retry: the `online` event will not fire on a
    // connection that never admitted to being down.
    if (pending.value.length > 0) {
      failedFlushes.value = undelivered ? failedFlushes.value + 1 : 0;
      scheduleRetry();
    } else {
      failedFlushes.value = 0;
      cancelRetry();
    }
  };

  /** A connection that properly came back deserves an immediate try, not the tail of a backoff. */
  const onBackOnline = () => {
    failedFlushes.value = 0;
    void flush();
  };

  /** The queued mark for this child in this class, if the phone is still holding one. */
  const queuedFor = (sessionId: number, childId: number): PendingMark | undefined =>
    pending.value.find((entry) => entry.sessionId === sessionId && entry.childId === childId);

  return {
    pending,
    flushing,
    load,
    tap,
    flush,
    onBackOnline,
    cancelRetry,
    queuedFor,
  };
}
