import { defineStore } from "pinia";
import { readonly } from "vue";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";
import type { EntityId } from "~/types/entityId";

type ClassSessionState = Record<string, ClassSessionWithAttendance[]>;

/**
 * The timetable, keyed by group.
 *
 * By group and not by child on purpose: sessions belong to a group, so two siblings in the same
 * group share one list and one request. In memory only, for the same reason `attendanceStore` is -
 * a session carries its group, its room and the room's location, so a handful of them already
 * overflow the browser's ~4 KB cookie limit, silently.
 */
export const useClassSessionStore = defineStore("classSession", () => {
  const sessions = ref<ClassSessionState>({});

  const setSessions = (groupId: EntityId, data: ClassSessionWithAttendance[]) => {
    sessions.value = {
      ...sessions.value,
      [groupId]: data,
    };
  };

  const sessionsByGroupId = (groupId: EntityId): ClassSessionWithAttendance[] => {
    return sessions.value[groupId] || [];
  };

  const hasSessionsForGroup = (groupId: EntityId): boolean => {
    return sessions.value[groupId] !== undefined;
  };

  const clearSessions = (groupId?: EntityId) => {
    if (groupId === undefined) {
      sessions.value = {};
      return;
    }

    const { [groupId]: _, ...rest } = sessions.value;
    sessions.value = rest;
  };

  return {
    sessions: readonly(sessions),
    setSessions,
    clearSessions,
    sessionsByGroupId,
    hasSessionsForGroup,
  };
});
