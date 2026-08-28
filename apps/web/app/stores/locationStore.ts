import { defineStore } from "pinia";
import type { Location } from "~/types/location.types";
import type { Room } from "~/types/room.types";

/** What the selector holds when the admin wants to see every location at once. */
export const ALL_LOCATIONS = "all";

export type LocationSelection = typeof ALL_LOCATIONS | number;

export const useLocationStore = defineStore("locations", () => {
  const locations = ref<Location[]>([]);
  const rooms = ref<Room[]>([]);

  // In a cookie, like the tokens, so the choice survives a reload and a full page navigation. A
  // ref alone resets on every hard load and quietly puts the admin back on "all locations" —
  // which is the one state where a list mixes the two addresses.
  const selectedLocationId = useCookie<LocationSelection>("selectedLocation", {
    default: () => ALL_LOCATIONS,
    sameSite: "lax",
  });

  const setLocations = (data: Location[]) => {
    locations.value = data;
    // A location that has been deleted, or one from an older session, would otherwise leave the
    // filter pointing at nothing and every list looking empty for no visible reason.
    if (
      selectedLocationId.value !== ALL_LOCATIONS &&
      !data.some((location) => location.id === selectedLocationId.value)
    ) {
      selectedLocationId.value = ALL_LOCATIONS;
    }
  };

  const setRooms = (data: Room[]) => {
    rooms.value = data;
  };

  const selectLocation = (selection: LocationSelection) => {
    selectedLocationId.value = selection;
  };

  const selectedLocation = computed(() =>
    selectedLocationId.value === ALL_LOCATIONS
      ? null
      : (locations.value.find((location) => location.id === selectedLocationId.value) ?? null)
  );

  const isShowingAll = computed(() => selectedLocationId.value === ALL_LOCATIONS);

  /** Rooms at the selected location, or all of them in "all locations" mode. */
  const roomsInSelection = computed(() =>
    selectedLocationId.value === ALL_LOCATIONS
      ? rooms.value
      : rooms.value.filter((room) => room.location.id === selectedLocationId.value)
  );

  /**
   * Rooms a new group may be scheduled into: open, at an open location.
   *
   * The API refuses the rest with `ROOM_INACTIVE`, so offering them would only produce a form that
   * fails on submit. Editing an existing group is the exception — a group already sitting in a
   * room that has since closed still has to be movable — so the group form adds its own room back
   * to this list rather than reading the flag itself.
   */
  const isUsable = (room: Room): boolean => room.isActive && room.location.isActive;

  const usableRooms = computed(() => rooms.value.filter(isUsable));

  /** Only the locations still open, for the places that ask someone to choose one. */
  const activeLocations = computed(() => locations.value.filter((location) => location.isActive));

  /**
   * The single place that decides whether something belongs to the current selection.
   *
   * Takes the location id rather than the entity, because the things being filtered reach it by
   * different routes: a group through its room, a child through its group's room, an attendance
   * record through its group. `null` means "not assigned anywhere yet", and those are kept
   * visible — a child without a group is exactly who an admin is looking for.
   */
  const matchesSelection = (locationId: number | null | undefined): boolean =>
    selectedLocationId.value === ALL_LOCATIONS ||
    locationId === null ||
    locationId === undefined ||
    locationId === selectedLocationId.value;

  return {
    locations: readonly(locations),
    rooms: readonly(rooms),
    selectedLocationId: readonly(selectedLocationId),
    selectedLocation,
    isShowingAll,
    roomsInSelection,
    usableRooms,
    activeLocations,
    isUsable,
    setLocations,
    setRooms,
    selectLocation,
    matchesSelection,
  };
});
