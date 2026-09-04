import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  BookTrialDto,
  CreateLeadDto,
  LeadFollowUp,
  LeadFunnel,
  LeadStatus,
  LeadSummary,
  LeadWithAge,
  LoseLeadDto,
  TrialBookingResult,
  TrialSlot,
  UpdateLeadDto,
} from "~/types/lead.types";

/**
 * Acquisition — E20.
 *
 * Split in two on purpose. The first two calls are the **public** ones: no `Authorization` header,
 * because a parent booking a trial has no account and the epic's whole point is that they should not
 * need one. Everything below them is the office, and carries the admin's token like every other
 * admin call.
 *
 * They still go through `useApi`, so a 401 refresh, the base URL and the error shape all behave the
 * same — the difference is the header, not the plumbing.
 */
export const useLeadsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  /** Public. The hours a child of this age could be offered, or an empty list. */
  const fetchTrialSlots = async (birthDate: string, locationId?: number) =>
    api<TrialSlot[]>("/trial/slots", {
      method: "GET",
      query: locationId ? { birthDate, locationId } : { birthDate },
    });

  /** Public. Books, or keeps the family on file when there is no seat — never an error to solve. */
  const bookTrial = async (body: BookTrialDto) =>
    api<TrialBookingResult>("/trial/bookings", { method: "POST", body });

  const fetchLeads = async (
    filters: { status?: LeadStatus; unassigned?: boolean; includeSettled?: boolean } = {}
  ) => api<LeadSummary[]>("/leads", { method: "GET", headers: auth(), query: filters });

  const fetchLead = async (id: number) =>
    api<LeadSummary>(`/leads/${id}`, { method: "GET", headers: auth() });

  const fetchFollowUp = async () =>
    api<LeadFollowUp>("/leads/follow-up", { method: "GET", headers: auth() });

  const fetchUndecidedTrials = async () =>
    api<LeadWithAge[]>("/leads/undecided", { method: "GET", headers: auth() });

  const createLead = async (body: CreateLeadDto) =>
    api<LeadSummary>("/leads", { method: "POST", headers: auth(), body });

  const updateLead = async (id: number, body: UpdateLeadDto) =>
    api<LeadSummary>(`/leads/${id}`, { method: "PATCH", headers: auth(), body });

  const markContacted = async (id: number) =>
    api<LeadSummary>(`/leads/${id}/contacted`, { method: "POST", headers: auth() });

  const markLost = async (id: number, body: LoseLeadDto) =>
    api<LeadSummary>(`/leads/${id}/lost`, { method: "POST", headers: auth(), body });

  const fetchFunnel = async (range: { from?: string; to?: string } = {}) =>
    api<LeadFunnel>("/reports/funnel", { method: "GET", headers: auth(), query: range });

  return {
    fetchTrialSlots,
    bookTrial,
    fetchLeads,
    fetchLead,
    fetchFollowUp,
    fetchUndecidedTrials,
    createLead,
    updateLead,
    markContacted,
    markLost,
    fetchFunnel,
  };
};
