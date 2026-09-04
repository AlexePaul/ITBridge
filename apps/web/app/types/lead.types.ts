export type {
  BookTrialDto,
  CreateLeadDto,
  LeadChannel,
  LeadFollowUp,
  LeadFunnel,
  LeadSource,
  LeadStatus,
  LeadSummary,
  LeadWithAge,
  LoseLeadDto,
  TrialBookingResult,
  TrialSlot,
  UpdateLeadDto,
} from "@itbridge/types";

import type { LeadChannel, LeadSource, LeadStatus } from "@itbridge/types";

/**
 * Romanian labels for the funnel — E20. Next to the screens that show them, per the standing rule:
 * the contract describes what goes on the wire, and on the wire it is `trial_held`, not „probă
 * ținută".
 */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nouă",
  contacted: "Contactat",
  trial_scheduled: "Probă programată",
  trial_held: "Probă ținută",
  enrolled: "Înscris",
  lost: "Pierdut",
};

/** How the request reached us. Always known, unlike the channel below. */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  trial_form: "Formular de pe site",
  phone: "Telefon",
  walk_in: "A venit la sediu",
  referral: "Recomandare",
  other: "Altfel",
};

/**
 * Where the family says they heard about the school.
 *
 * Self-declared, and the screens say so: E20/S5 decided against referral codes, so „Recomandare"
 * here is a parent's word rather than something the platform attributed.
 */
export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  google: "Căutare pe Google",
  facebook: "Facebook",
  instagram: "Instagram",
  friend: "Recomandare de la altă familie",
  flyer: "Pliant",
  passing_by: "Am trecut prin fața școlii",
  other: "Altfel",
};

/** The label a status badge gets, so a colour is not the only thing carrying the meaning. */
export const LEAD_STATUS_COLORS: Record<
  LeadStatus,
  "neutral" | "info" | "warning" | "success" | "error"
> = {
  new: "info",
  contacted: "neutral",
  trial_scheduled: "info",
  trial_held: "warning",
  enrolled: "success",
  lost: "neutral",
};

/** ISO weekday to the day a parent would say. 1 = Monday, as everywhere else in this codebase. */
export const WEEKDAY_NAMES: Record<number, string> = {
  1: "luni",
  2: "marți",
  3: "miercuri",
  4: "joi",
  5: "vineri",
  6: "sâmbătă",
  7: "duminică",
};
