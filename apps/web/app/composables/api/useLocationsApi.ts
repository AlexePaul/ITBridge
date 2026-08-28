import { useTokenStore } from "~/stores/tokenStore";
import { useApi } from "./useApi";
import type { Location } from "~/types/location.types";
import { useLocationStore } from "~/stores/locationStore";

export const useLocationsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const locationStore = useLocationStore();

  const authHeaders = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  const fetchLocations = async () => {
    const data = await api<Location[]>("/locations", { method: "GET", headers: authHeaders() });
    locationStore.setLocations(data);
    return data;
  };

  const createLocation = async (payload: Partial<Location>) => {
    const created = await api<Location>("/locations", {
      method: "POST",
      headers: authHeaders(),
      body: payload,
    });
    locationStore.setLocations([...locationStore.locations, created]);
    return created;
  };

  const updateLocation = async (locationId: number, payload: Partial<Location>) => {
    const updated = await api<Location>(`/locations/${locationId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: payload,
    });
    locationStore.setLocations(
      locationStore.locations.map((location) => (location.id === updated.id ? updated : location))
    );
    return updated;
  };

  const deleteLocation = async (locationId: number) => {
    await api(`/locations/${locationId}`, { method: "DELETE", headers: authHeaders() });
    locationStore.setLocations(locationStore.locations.filter((l) => l.id !== locationId));
  };

  // Errors are rethrown rather than swallowed: a page that awaits one of these and shows a success
  // message on a rejected request is the bug this codebase already fixed once, in `useGroupsApi`.
  return { fetchLocations, createLocation, updateLocation, deleteLocation };
};
