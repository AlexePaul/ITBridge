import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useChildrenStore } from "~/stores/childrenStore";
import { useAttendanceStore } from "~/stores/attendanceStore";
import type { Child } from "~/types/child.types";

/**
 * Store-urile fac lookup-uri după id. Id-urile vin numerice din API, dar ajung ca string când vin
 * din `route.params`, iar codul se bazează pe `==` slab ca să acopere ambele forme. Testele fixează
 * exact asta: o trecere la `===` ar rupe navigarea pe rută fără niciun alt semnal.
 */

const child = (id: number, groupId?: number): Child =>
  ({
    id,
    firstName: `Copil${id}`,
    lastName: "Test",
    birthDate: "2015-01-01",
    createdAt: "2026-01-01",
    parent: { id: 1, firstName: "Ana", lastName: "Pop" },
    ...(groupId === undefined ? {} : { group: { id: groupId } }),
  }) as Child;

describe("childrenStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const seeded = () => {
    const store = useChildrenStore();
    store.setChildren([child(1, 10), child(2, 10), child(3, 20), child(4)]);
    return store;
  };

  it("găsește copilul după id numeric", () => {
    expect(seeded().getChildById(2)?.firstName).toBe("Copil2");
  });

  it("găsește copilul și după id ca string, cum vine din rută", () => {
    expect(seeded().getChildById("2")?.firstName).toBe("Copil2");
  });

  it("întoarce undefined pentru un id inexistent", () => {
    expect(seeded().getChildById(99)).toBeUndefined();
  });

  it("numără copiii dintr-o grupă, cu id string sau numeric", () => {
    const store = seeded();
    expect(store.getChildrenNumberByGroupId(10)).toBe(2);
    expect(store.getChildrenNumberByGroupId("10")).toBe(2);
  });

  it("întoarce copiii unei grupe", () => {
    expect(
      seeded()
        .getChildrenByGroupId(20)
        .map((c) => c.id)
    ).toEqual([3]);
  });

  it("întoarce copiii din afara unei grupe, inclusiv pe cei fără grupă", () => {
    expect(
      seeded()
        .getChildrenNotInGroupId(10)
        .map((c) => c.id)
    ).toEqual([3, 4]);
  });

  it("întoarce copiii fără grupă", () => {
    expect(
      seeded()
        .getChildrenWithoutGroup()
        .map((c) => c.id)
    ).toEqual([4]);
  });

  it("golește lista", () => {
    const store = seeded();
    store.clearChildren();
    expect(store.children).toHaveLength(0);
  });
});

describe("attendanceStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const record = (date: string) => ({
    id: 1,
    date,
    startTime: "09:00:00",
    type: "regular" as const,
    present: true,
    group: { id: 10 } as never,
  });

  it("regăsește prezența după id numeric sau string", () => {
    const store = useAttendanceStore();
    store.setAttendance(7, [record("2026-03-10")]);

    expect(store.attendancesByChildId(7)).toHaveLength(1);
    expect(store.attendancesByChildId("7")).toHaveLength(1);
  });

  it("întoarce listă goală pentru un copil necunoscut", () => {
    expect(useAttendanceStore().attendancesByChildId(99)).toEqual([]);
  });

  it("găsește prezența dintr-o anumită zi", () => {
    const store = useAttendanceStore();
    store.setAttendance(7, [record("2026-03-10"), record("2026-03-17")]);

    expect(store.attendancesByChildIdAndDate(7, new Date("2026-03-17"))).toBeDefined();
    expect(store.attendancesByChildIdAndDate(7, new Date("2026-03-24"))).toBeUndefined();
  });
});
