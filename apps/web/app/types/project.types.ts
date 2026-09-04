// The contract lives in packages/types. This file is the usual thin bridge, so pages import from
// `~/types/...` like everything else.
export type {
  Project,
  ProjectFile,
  ProjectLink,
  ProjectStatus,
  ProjectSource,
  ProjectVersion,
  UnassignedFile,
  UnassignedFileReason,
  AgentStatus,
  AgentMirror,
  SendProjectsResult,
  SendProjectsRecipient,
  SkippedProjectReason,
  UndeliverableReason,
  PendingProjectsSummary,
  PendingProjectsGroup,
} from "@itbridge/types";

import type { PendingProjectsSummary as Summary } from "@itbridge/types";

/**
 * Whether the backlog has stopped being a queue and become a lapse — E17/S8.
 *
 * A function here rather than a constant, and the threshold is read off the payload rather than
 * written down again: `staleAfterDays` is a proposal the API publishes precisely so the screen can
 * say which line it is drawing. A copy of the number on this side would be the second definition,
 * and the second one is the one that goes out of date.
 *
 * Lives next to the screens, per the standing rule — nothing new goes into the contract package as
 * a runtime value.
 */
export function isStale(summary: Summary | null): boolean {
  if (!summary || summary.oldestDays === null) return false;
  return summary.oldestDays >= summary.staleAfterDays;
}

// Values, not just types: these are Romanian lookup tables a template reads directly. They are
// plain objects rather than enums — nothing new in the contract package may be an enum, because
// Vite's prebundler once dropped a new one's body as dead code and left the import `undefined`.
export {
  PROJECT_STATUS_LABELS,
  PROJECT_SOURCE_LABELS,
  UNASSIGNED_FILE_REASON_LABELS,
  SKIPPED_PROJECT_REASON_LABELS,
  UNDELIVERABLE_REASON_LABELS,
} from "@itbridge/types";
