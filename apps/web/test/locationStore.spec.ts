import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ALL_LOCATIONS, useLocationStore } from "~/stores/locationStore";
import type { Location } from "~/types/location.types";
import type { Room } from "~/types/room.types";

/**
 * The location filter is one piece of state read by every admin list, so what it means has to be
 * pinned down in one place: which records a selection includes, and what happens to the selection
 * when the location it points at goes away.
 */

const location = (id: number, slug: string, name: string, isActive = true): Location =>
  ({ id, slug, name, street: "Strada Test 1", city: "București", isActive }) as Location;

const room = (id: number, at: Location, isActive = true): Room =>
  ({ id, name: "Sala 1", capacity: 10, location: at, isActive }) as Room;

const drumulTaberei = location(1, "drumul-taberei", "Drumul Taberei");
const straulesti = location(2, "straulesti", "Străulești");

describe("locationStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const seeded = () => {
    const store = useLocationStore();
    store.setLocations([drumulTaberei, straulesti]);
    store.setRooms([room(10, drumulTaberei), room(20, straulesti)]);
    return store;
  };

  it("starts on all locations", () => {
    const store = seeded();
    expect(store.isShowingAll).toBe(true);
    expect(store.selectedLocation).toBeNull();
  });

  it("matches everything while showing all locations", () => {
    const store = seeded();
    expect(store.matchesSelection(1)).toBe(true);
    expect(store.matchesSelection(2)).toBe(true);
  });

  it("matches only the selected location once one is picked", () => {
    const store = seeded();
    store.selectLocation(2);

    expect(store.matchesSelection(2)).toBe(true);
    expect(store.matchesSelection(1)).toBe(false);
    expect(store.selectedLocation?.slug).toBe("straulesti");
  });

  // A child with no group has no location, and hiding them would hide exactly the records an
  // admin opens the children list to find.
  it("keeps records that belong nowhere yet visible in every selection", () => {
    const store = seeded();
    store.selectLocation(1);

    expect(store.matchesSelection(null)).toBe(true);
    expect(store.matchesSelection(undefined)).toBe(true);
  });

  it("narrows the room list to the selection", () => {
    const store = seeded();
    expect(store.roomsInSelection).toHaveLength(2);

    store.selectLocation(1);
    expect(store.roomsInSelection.map((r) => r.id)).toEqual([10]);
  });

  // The selection lives in a cookie, so it can outlive the location it names — after a delete, or
  // a session that started before it existed. Left alone, every list would come back empty with
  // nothing on screen explaining why.
  it("falls back to all locations when the selected one is gone", () => {
    const store = seeded();
    store.selectLocation(2);

    store.setLocations([drumulTaberei]);

    expect(store.selectedLocationId).toBe(ALL_LOCATIONS);
    expect(store.matchesSelection(1)).toBe(true);
  });

  // A closed room takes no new groups — the API refuses it with `ROOM_INACTIVE` — so offering one
  // in a form would only produce a submit that fails.
  it("leaves closed rooms out of the ones a group can be scheduled into", () => {
    const store = useLocationStore();
    store.setLocations([drumulTaberei, straulesti]);
    store.setRooms([room(10, drumulTaberei), room(20, straulesti, false)]);

    expect(store.usableRooms.map((r) => r.id)).toEqual([10]);
  });

  it("treats every room at a closed location as unusable, however open the room is", () => {
    const closed = location(3, "titan", "Titan", false);
    const store = useLocationStore();
    store.setLocations([drumulTaberei, closed]);
    store.setRooms([room(10, drumulTaberei), room(30, closed)]);

    expect(store.usableRooms.map((r) => r.id)).toEqual([10]);
    expect(store.activeLocations.map((l) => l.id)).toEqual([1]);
  });

  // The switcher keeps it listed, marked — its groups and its attendance history are still there,
  // and a location that vanishes the moment it is deactivated looks like data loss.
  it("keeps a closed location selectable", () => {
    const closed = location(3, "titan", "Titan", false);
    const store = useLocationStore();
    store.setLocations([drumulTaberei, closed]);
    store.selectLocation(3);

    expect(store.selectedLocation?.name).toBe("Titan");
  });

  it("keeps a still-valid selection across a reload of the list", () => {
    const store = seeded();
    store.selectLocation(1);

    store.setLocations([drumulTaberei, straulesti]);

    expect(store.selectedLocationId).toBe(1);
  });
});
