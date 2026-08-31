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
} from "@itbridge/types";

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
