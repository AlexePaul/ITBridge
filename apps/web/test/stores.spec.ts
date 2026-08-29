import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useChildrenStore } from "~/stores/childrenStore";
import { useAttendanceStore } from "~/stores/attendanceStore";
import type { Child } from "~/types/child.types";

/**
 * The stores look records up by id. Ids arrive as numbers from the API but as strings when they
 * come from `route.params`, and the code relies on loose `==` to cover both shapes. These tests
 * pin exactly that down: switching to `===` would break route navigation with no other signal.
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

  it("finds a child by numeric id", () => {
    expect(seeded().getChildById(2)?.firstName).toBe("Copil2");
  });

  it("finds a child by string id too, as it arrives from the route", () => {
    expect(seeded().getChildById("2")?.firstName).toBe("Copil2");
  });

  it("returns undefined for an unknown id", () => {
    expect(seeded().getChildById(99)).toBeUndefined();
  });

  it("counts the children of a group, with a string or numeric id", () => {
    const store = seeded();
    expect(store.getChildrenNumberByGroupId(10)).toBe(2);
    expect(store.getChildrenNumberByGroupId("10")).toBe(2);
  });

  it("returns the children of a group", () => {
    expect(
      seeded()
        .getChildrenByGroupId(20)
        .map((c) => c.id)
    ).toEqual([3]);
  });

  it("returns the children outside a group, including those with no group", () => {
    expect(
      seeded()
        .getChildrenNotInGroupId(10)
        .map((c) => c.id)
    ).toEqual([3, 4]);
  });

  it("returns the children with no group", () => {
    expect(
      seeded()
        .getChildrenWithoutGroup()
        .map((c) => c.id)
    ).toEqual([4]);
  });

  it("clears the list", () => {
    const store = seeded();
    store.clearChildren();
    expect(store.children).toHaveLength(0);
  });
});

describe("attendanceStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // The day lives on the class the mark belongs to. The record's own `date` and `startTime` are
  // gone from the contract, and the store now reads through `classSession`.
  const record = (date: string) => ({
    id: 1,
    classSession: { id: 1, date, startTime: "09:00:00" } as never,
    type: "regular" as const,
    present: true,
    group: { id: 10 } as never,
  });

  it("looks attendance up by numeric or string id", () => {
    const store = useAttendanceStore();
    store.setAttendance(7, [record("2026-03-10")]);

    expect(store.attendancesByChildId(7)).toHaveLength(1);
    expect(store.attendancesByChildId("7")).toHaveLength(1);
  });

  it("returns an empty list for an unknown child", () => {
    expect(useAttendanceStore().attendancesByChildId(99)).toEqual([]);
  });

  /**
   * Prezența a stat într-un cookie și nu a încăput niciodată: o înregistrare cară ședința întreagă,
   * cu grupa, sala și locația, deci șapte ședințe înseamnă 18,6 KB URI-encoded, față de limita de
   * ~4 KB. Browserul arunca pur și simplu cookie-ul, fără nicio eroare, iar calendarul părintelui
   * se randa gol — ca și cum copilul n-ar fi fost la nicio oră.
   *
   * Testul se uită la mecanism, nu la mărime, fiindcă `useCookie` e dublat aici și nu impune nicio
   * limită: un test pe dimensiune ar trece și cu bug-ul la loc.
   */
  it("nu ține prezența într-un cookie — nu încape, iar eșecul e tăcut", () => {
    const useCookieSpy = vi.fn(() => ({ value: {} }));
    vi.stubGlobal("useCookie", useCookieSpy);

    const store = useAttendanceStore();
    store.setAttendance(7, [record("2026-03-10")]);

    expect(store.attendancesByChildId(7)).toHaveLength(1);
    expect(useCookieSpy).not.toHaveBeenCalled();
  });
});
