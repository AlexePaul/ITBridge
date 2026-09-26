import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarkQueue, type MarkRequest } from "~/composables/useMarkQueue";

/**
 * The phone register's queue — E12/S6, and the review of 26 September 2026, which found it losing
 * marks in two ways on exactly the connection it exists for: one bar of signal, where requests time
 * out and the retries overlap the teacher's next taps.
 */

const STORAGE_KEY = "attendance-pending-marks-v1";
const networkError = () => new Error("fetch failed");

/** A fake server: what it holds per `session:child`, and what reached it, in order. */
type Behaviour = "ok" | "network" | { hold: Promise<void> };
let script: Behaviour[] = [];
const held = new Map<string, boolean>();
const wire: string[] = [];
const send = vi.fn(async (mark: MarkRequest) => {
  const behaviour = script.shift() ?? "ok";
  if (behaviour === "network") throw networkError();
  if (typeof behaviour === "object") await behaviour.hold;
  held.set(`${mark.sessionId}:${mark.childId}`, mark.present);
  wire.push(`${mark.childId}:${mark.present ? "present" : "absent"}`);
});

let store: Map<string, string>;
const stored = () => JSON.parse(store.get(STORAGE_KEY) ?? "[]") as MarkRequest[];

const ana = (present: boolean): MarkRequest => ({ sessionId: 7, childId: 1, present });
const bogdan = (present: boolean): MarkRequest => ({ sessionId: 7, childId: 2, present });

beforeEach(() => {
  vi.useFakeTimers();
  script = [];
  held.clear();
  wire.length = 0;
  send.mockClear();
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useMarkQueue — a pass removes only what it settled", () => {
  /**
   * The flush used to end with `pending = remaining`, where `remaining` was computed from the list
   * it started with. A tap that failed while the pass was running — queued into the live list — was
   * therefore overwritten: gone from memory and from localStorage, the banner gone with it, and the
   * row still showing the cloud icon for a mark that would never be sent.
   */
  it("keeps a tap that failed while a retry pass was running, and delivers it later", async () => {
    const onDelivered = vi.fn();
    const queue = useMarkQueue({ send, onDelivered });

    script = ["network"];
    expect((await queue.tap(ana(true))).outcome).toBe("queued");

    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    script = [{ hold }, "network"];
    const pass = queue.flush();
    expect((await queue.tap(bogdan(false))).outcome).toBe("queued");
    release();
    await pass;

    expect(queue.pending.value.map((mark) => mark.childId)).toEqual([2]);
    expect(stored().map((mark) => mark.childId)).toEqual([2]);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(held.get("7:2")).toBe(false);
    expect(queue.pending.value).toHaveLength(0);
    expect(store.has(STORAGE_KEY)).toBe(false);
    expect(onDelivered).toHaveBeenCalledWith(expect.objectContaining({ childId: 2 }));
  });

  it("drops a mark the server refused, keeps one it never received", async () => {
    const onRefused = vi.fn();
    const refusal = Object.assign(new Error("gone"), { status: 404 });
    const queue = useMarkQueue({
      send: vi.fn(async (mark: MarkRequest) => {
        if (mark.childId === 1) throw refusal;
        throw networkError();
      }),
      onRefused,
    });
    queue.pending.value = [
      { ...ana(true), queuedAt: 1 },
      { ...bogdan(true), queuedAt: 2 },
    ];

    await queue.flush();

    expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ childId: 1 }), refusal);
    expect(queue.pending.value.map((mark) => mark.childId)).toEqual([2]);
    queue.cancelRetry();
  });
});

describe("useMarkQueue — a tap that got through is newer than anything queued", () => {
  /**
   * "Absent" timed out and waited; the child walked in and "Prezent" went straight through. The
   * queued "absent" stayed, and the next retry wrote it over the newer mark — minutes later, or days
   * later, since the queue lives in localStorage and drains every time the screen opens. The
   * teacher's screen said present; the school's register said absent.
   */
  it("drops the older queued mark for the same child when a newer tap succeeds", async () => {
    const queue = useMarkQueue({ send });

    script = ["network"];
    await queue.tap(ana(false));
    expect(stored()).toHaveLength(1);

    script = ["ok"];
    expect((await queue.tap(ana(true))).outcome).toBe("saved");
    expect(queue.pending.value).toHaveLength(0);
    expect(store.has(STORAGE_KEY)).toBe(false);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(held.get("7:1")).toBe(true);
    expect(wire).toEqual(["1:present"]);
  });

  it("leaves another child's queued mark alone", async () => {
    const queue = useMarkQueue({ send });
    script = ["network"];
    await queue.tap(bogdan(false));
    script = ["ok"];
    await queue.tap(ana(true));
    expect(queue.pending.value.map((mark) => mark.childId)).toEqual([2]);
    queue.cancelRetry();
  });

  /**
   * The same race one step later: the retry pass is still holding the old mark when the new tap is
   * made. The tap waits for the request in the air instead of racing it, and the pass does not send
   * a mark a newer tap has replaced.
   */
  it("never lets an older mark for a child land after a newer one", async () => {
    const queue = useMarkQueue({ send });
    script = ["network"];
    await queue.tap(ana(false));

    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    script = [{ hold }, "ok"];
    const pass = queue.flush();
    const tap = queue.tap(ana(true));
    release();
    await Promise.all([pass, tap]);

    expect(wire).toEqual(["1:absent", "1:present"]);
    expect(held.get("7:1")).toBe(true);
    expect(queue.pending.value).toHaveLength(0);
  });

  it("does not send a queued mark that a newer failed tap has replaced before the pass reached it", async () => {
    const queue = useMarkQueue({ send });
    queue.pending.value = [
      { ...bogdan(true), queuedAt: 1 },
      { ...ana(false), queuedAt: 2 },
    ];

    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    script = [{ hold }, "network", "ok"];
    const pass = queue.flush();
    // Bogdan's request is in the air; Ana's new tap fails and replaces her queued "absent".
    expect((await queue.tap(ana(true))).outcome).toBe("queued");
    release();
    await pass;

    expect(wire).toEqual(["2:present"]);
    expect(queue.pending.value).toEqual([expect.objectContaining({ childId: 1, present: true })]);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(held.get("7:1")).toBe(true);
  });
});
