export type { Group } from "@itbridge/types";
export { Weekday, WEEKDAYS_IN_ORDER, WEEKDAY_LABELS } from "@itbridge/types";

import type { Weekday } from "@itbridge/types";

/**
 * What the group forms send, which is not the shape the API returns: a group carries a whole
 * `room` object out, and takes a bare `roomId` in. Typing the composable as `Partial<Group>` made
 * `roomId` an error and `room` look like something a form could submit.
 */
export interface GroupPayload {
  name: string;
  roomId: number;
  weekday: Weekday | number;
  startTime: string;
  endTime: string;
  capacity: number;
  minAge: number;
  maxAge: number;
  isActive: boolean;
}
