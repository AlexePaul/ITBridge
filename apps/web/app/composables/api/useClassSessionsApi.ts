import { useApi } from "./useApi";
import { useClassSessionStore } from "~/stores/classSessionStore";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  ClassSessionStatus,
  ClassSessionWithAttendance,
  GenerateClassSessionsResult,
} from "~/types/class-session.types";
import type { EntityId } from "~/types/entityId";

/** Query for `GET /class-sessions`. Both ends of the interval are inclusive, as the API defines them. */
export interface ClassSessionFilters {
  groupId?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: ClassSessionStatus;
}

/**
 * Body for `POST /class-sessions/generate`. Every field is optional and every default lives on the
 * server: no group id means every active group, no `from` means today, no `weeks` means eight.
 */
export interface GenerateSessionsPayload {
  groupId?: number;
  /** `YYYY-MM-DD`, the first day of the horizon. */
  from?: string;
  /** How many weeks ahead. The API refuses anything outside 1..52. */
  weeks?: number;
}

/** The rolling horizon the API generates by default, mirrored here so a screen can say "8 weeks". */
export const DEFAULT_HORIZON_WEEKS = 8;

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

  /**
   * Writes the timetable for one group, or for every active group when `groupId` is omitted.
   *
   * Idempotent by (group, day) on the server: a class that already exists is counted and left
   * exactly as it is, whatever its status, so running this twice never doubles a timetable and
   * never resurrects a class somebody cancelled. That is what lets the screens offer it as a plain
   * button instead of a dangerous one.
   *
   * Undefined fields are sent as-is rather than stripped, unlike the query in `fetchSessions`:
   * `JSON.stringify` drops them from the body, so the API sees an absent field and applies its own
   * default. It is the query string, not the body, that turns `undefined` into the string
   * "undefined" and then into a 400.
   *
   * Throws on failure - the caller shows the message. Returning a status code here is the bug the
   * comment in `useGroupsApi` records: the page carried on and reported success.
   */
  const generateSessions = async (payload: GenerateSessionsPayload = {}) =>
    api<GenerateClassSessionsResult>("/class-sessions/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: payload,
    });

  return {
    fetchSessions,
    fetchGroupSessions,
    generateSessions,
  };
};
