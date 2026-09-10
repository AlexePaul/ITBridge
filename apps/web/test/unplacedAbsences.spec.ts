import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { AbsenceNotice } from "~/types/attendance.types";

/**
 * The office's Monday list is asked for twice on one paint — E12/S4.
 *
 * The dashboard layout fetches it on mount so the menu badge exists on every admin screen, and
 * `/admin/absente` fetches it again in its own `load()`, because the screen needs its own loading
 * and error state rather than a store that may or may not have been filled behind it. Neither call
 * can be dropped, so `useAttendanceApi` shares the request while it is in flight. Both halves of
 * that are worth pinning down: one request for two callers who ask together, and a real request
 * again once it has settled — a shared promise that outlived its request would make every move and
 * withdrawal refresh nothing.
 */

const tokenStore = { accessToken: "acces" };

vi.mock("~/stores/tokenStore", () => ({ useTokenStore: () => tokenStore }));

interface Call {
  url: string;
  resolve: (notices: AbsenceNotice[]) => void;
  reject: (err: Error) => void;
}

let calls: Call[] = [];

vi.mock("~/composables/api/useApi", () => ({
  useApi:
    () =>
    <T>(url: string): Promise<T> =>
      new Promise<AbsenceNotice[]>((resolve, reject) => {
        calls.push({ url, resolve, reject });
      }) as unknown as Promise<T>,
}));

const notice = (id: number): AbsenceNotice => ({ id }) as AbsenceNotice;

/** Fresh module each time: the shared promise is module-level, as `refreshPromise` in `useApi` is. */
const loadApi = async () => {
  vi.resetModules();
  const mod = await import("~/composables/api/useAttendanceApi");
  return mod.useAttendanceApi();
};

describe("fetchUnplacedAbsences", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    calls = [];
  });

  it("asks once when the layout and the screen ask together", async () => {
    const api = await loadApi();

    const layout = api.fetchUnplacedAbsences();
    const screen = api.fetchUnplacedAbsences();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/attendance/replacements/unplaced");

    calls[0].resolve([notice(1), notice(2)]);
    expect(await layout).toHaveLength(2);
    expect(await screen).toHaveLength(2);
  });

  it("asks again once the shared request has settled", async () => {
    const api = await loadApi();

    const first = api.fetchUnplacedAbsences();
    calls[0].resolve([notice(1)]);
    await first;

    const second = api.fetchUnplacedAbsences();
    expect(calls).toHaveLength(2);
    calls[1].resolve([]);
    await second;
  });

  it("asks again after a failed request rather than replaying the failure", async () => {
    const api = await loadApi();

    const failing = api.fetchUnplacedAbsences();
    calls[0].reject(new Error("500"));
    await expect(failing).rejects.toThrow("500");

    const retry = api.fetchUnplacedAbsences();
    expect(calls).toHaveLength(2);
    calls[1].resolve([notice(1)]);
    expect(await retry).toHaveLength(1);
  });

  it("fills the menu store, which is what the badge reads", async () => {
    const api = await loadApi();
    const { useUnplacedAbsencesStore } = await import("~/stores/unplacedAbsencesStore");

    const inFlight = api.fetchUnplacedAbsences();
    calls[0].resolve([notice(1), notice(2), notice(3)]);
    await inFlight;

    expect(useUnplacedAbsencesStore().total).toBe(3);
  });
});
