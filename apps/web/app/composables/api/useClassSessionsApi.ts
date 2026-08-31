import { useApi } from "./useApi";
import { useClassSessionStore } from "~/stores/classSessionStore";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  ClassSessionStatus,
  ClassSessionWithAttendance,
  GenerateClassSessionsResult,
  NonTeachingImpact,
  NonTeachingPeriod,
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

/**
 * Body for `POST /class-sessions/non-teaching`. `locationId` absent means the whole school, which
 * is every school holiday and every national one — that is, all of them so far.
 */
export interface CreateNonTeachingPeriodPayload {
  name: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive: a single day is the same date twice. */
  endDate: string;
  locationId?: number | null;
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

  /** The school calendar: holidays and days off, soonest first. Admin only. */
  const fetchNonTeachingPeriods = async () =>
    api<NonTeachingPeriod[]>("/class-sessions/non-teaching", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /**
   * What a period *would* cancel, without writing anything.
   *
   * The screen asks this on every change to the dates, so a mistyped year shows up as "grupa de
   * luni pierde 8 ședințe" before the button is pressed rather than as a gap noticed in January.
   * `locationId` is stripped when absent, for the reason `fetchSessions` records: an undefined in
   * a query string reaches the API as the string "undefined" and comes back a 400.
   */
  const fetchNonTeachingImpact = async (params: {
    startDate: string;
    endDate: string;
    locationId?: number | null;
  }) => {
    const query: Record<string, string | number> = {
      startDate: params.startDate,
      endDate: params.endDate,
    };
    if (params.locationId) query.locationId = params.locationId;

    return api<NonTeachingImpact>("/class-sessions/non-teaching/impact", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      query,
    });
  };

  /**
   * Adds a period and cancels the classes inside it, answering how many it cancelled.
   *
   * Cancels rather than deletes, so the timetable keeps saying the class existed and did not
   * happen. Refused with `PERIOD_OVERLAPS` if any existing period covers any of the same days.
   */
  const createNonTeachingPeriod = async (payload: CreateNonTeachingPeriodPayload) =>
    api<{ period: NonTeachingPeriod; cancelled: number }>("/class-sessions/non-teaching", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      body: payload,
    });

  /** Removes a period. The sessions it cancelled stay cancelled — the API is explicit about that. */
  const deleteNonTeachingPeriod = async (id: EntityId) =>
    api<{ message: string }>(`/class-sessions/non-teaching/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return {
    fetchSessions,
    fetchGroupSessions,
    generateSessions,
    fetchNonTeachingPeriods,
    fetchNonTeachingImpact,
    createNonTeachingPeriod,
    deleteNonTeachingPeriod,
  };
};
