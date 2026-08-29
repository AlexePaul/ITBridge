import { useApi } from "./useApi";
import { useClassSessionStore } from "~/stores/classSessionStore";
import { useTokenStore } from "~/stores/tokenStore";
import type { ClassSessionStatus, ClassSessionWithAttendance } from "~/types/class-session.types";
import type { EntityId } from "~/types/entityId";

/** Query for `GET /class-sessions`. Both ends of the interval are inclusive, as the API defines them. */
export interface ClassSessionFilters {
  groupId?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: ClassSessionStatus;
}

export const useClassSessionsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const classSessionStore = useClassSessionStore();

  /**
   * The timetable, filtered.
   *
   * Undefined filters are stripped rather than sent: `?groupId=undefined` reaches the API as the
   * string "undefined", and `enableImplicitConversion` is off there, so it is a 400 rather than
   * the "no filter" the caller meant.
   */
  const fetchSessions = async (filters: ClassSessionFilters = {}) => {
    const query = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== "")
    );

    return api<ClassSessionWithAttendance[]>("/class-sessions", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      query,
    });
  };

  /**
   * The whole timetable of one group, into the store.
   *
   * No date filter: the parent calendar can be paged to any month, and asking again on every
   * arrow would make each of those months flicker through a request. A group's list is small -
   * sessions are generated eight weeks ahead, not for the next decade.
   *
   * A parent may call this for their own children's groups only, and the API enforces it by
   * filtering rather than refusing: another group's id comes back as `[]`, not as a 403. So an
   * empty list means "not your group", never "something went wrong".
   */
  const fetchGroupSessions = async (groupId: EntityId) => {
    const sessions = await fetchSessions({ groupId: Number(groupId) });
    classSessionStore.setSessions(groupId, sessions);
    return sessions;
  };

  return {
    fetchSessions,
    fetchGroupSessions,
  };
};
