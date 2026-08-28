import { useTokenStore } from "~/stores/tokenStore";
import { useApi } from "./useApi";
import type { Room } from "~/types/room.types";
import { useLocationStore } from "~/stores/locationStore";

export const useRoomsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const locationStore = useLocationStore();

  const authHeaders = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  /** Without `locationId` this returns every room, each carrying its own location. */
  const fetchRooms = async (locationId?: number) => {
    const data = await api<Room[]>("/rooms", {
      method: "GET",
      headers: authHeaders(),
      query: locationId === undefined ? undefined : { locationId },
    });
    if (locationId === undefined) locationStore.setRooms(data);
    return data;
  };

  const createRoom = async (payload: { name: string; locationId: number; capacity: number }) => {
    const created = await api<Room>("/rooms", {
      method: "POST",
      headers: authHeaders(),
      body: payload,
    });
    locationStore.setRooms([...locationStore.rooms, created]);
    return created;
  };

  const updateRoom = async (roomId: number, payload: Record<string, unknown>) => {
    const updated = await api<Room>(`/rooms/${roomId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: payload,
    });
    locationStore.setRooms(
      locationStore.rooms.map((room) => (room.id === updated.id ? updated : room))
    );
    return updated;
  };

  const deleteRoom = async (roomId: number) => {
    await api(`/rooms/${roomId}`, { method: "DELETE", headers: authHeaders() });
    locationStore.setRooms(locationStore.rooms.filter((room) => room.id !== roomId));
  };

  return { fetchRooms, createRoom, updateRoom, deleteRoom };
};
