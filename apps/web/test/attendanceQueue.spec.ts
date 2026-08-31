import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readPendingMarks,
  upsertPending,
  writePendingMarks,
  type PendingMark,
} from "~/composables/useAttendanceQueue";

const mark = (childId: number, present: boolean, sessionId = 9): PendingMark => ({
  sessionId,
  childId,
  present,
  queuedAt: 1,
});

describe("upsertPending", () => {
  it("appends a mark for a child not yet queued", () => {
    expect(upsertPending([mark(1, true)], mark(2, false))).toHaveLength(2);
  });

  it("replaces an earlier mark for the same child in the same class — the stale one is a request the phone does not need to make", () => {
    const queue = upsertPending([mark(1, true)], mark(1, false));
    expect(queue).toHaveLength(1);
    expect(queue[0]!.present).toBe(false);
  });

  it("keeps the same child's mark in a different class", () => {
    expect(upsertPending([mark(1, true, 9)], mark(1, true, 10))).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const queue = [mark(1, true)];
    upsertPending(queue, mark(1, false));
    expect(queue[0]!.present).toBe(true);
  });
});

describe("the storage round trip", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });

  it("reads back what it wrote", () => {
    writePendingMarks([mark(1, true), mark(2, false)]);
    expect(readPendingMarks()).toHaveLength(2);
  });

  it("an empty queue removes the key instead of storing []", () => {
    writePendingMarks([mark(1, true)]);
    writePendingMarks([]);
    expect(localStorage.getItem("attendance-pending-marks-v1")).toBeNull();
  });

  it("answers [] for garbage in storage, instead of crashing mid-class", () => {
    localStorage.setItem("attendance-pending-marks-v1", "{nu e json");
    expect(readPendingMarks()).toEqual([]);
    localStorage.setItem("attendance-pending-marks-v1", '{"a":1}');
    expect(readPendingMarks()).toEqual([]);
  });

  it("drops rows that lost their shape, keeps the ones that did not", () => {
    localStorage.setItem(
      "attendance-pending-marks-v1",
      JSON.stringify([mark(1, true), { childId: "2" }])
    );
    expect(readPendingMarks()).toHaveLength(1);
  });

  it("survives storage throwing — a private window degrades, it does not crash", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readPendingMarks()).toEqual([]);
    expect(() => writePendingMarks([mark(1, true)])).not.toThrow();
  });
});
