import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  ClientErrorReport,
  ErrorReport,
  ErrorReportState,
  ErrorReportSummary,
  ErrorSource,
} from "~/types/error-report.types";

/** The error record — E06 S1. Reading it is the office's; adding to it, any signed-in browser's. */
export const useErrorsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  /** Undefined and empty filters are left out: `?ref=` would reach the API as a code of nothing. */
  const fetchErrors = async (
    filter: { state?: ErrorReportState; source?: ErrorSource; ref?: string } = {}
  ) => {
    const query = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined && value !== "")
    );
    return api<ErrorReport[]>("/errors", { method: "GET", headers: auth(), query });
  };

  const fetchErrorSummary = async () =>
    api<ErrorReportSummary>("/errors/summary", { method: "GET", headers: auth() });

  const resolveError = async (id: number) =>
    api<ErrorReport>(`/errors/${id}/resolve`, { method: "POST", headers: auth() });

  const reportClientError = async (body: ClientErrorReport) =>
    api<{ accepted: true }>("/errors/client", { method: "POST", headers: auth(), body });

  return { fetchErrors, fetchErrorSummary, resolveError, reportClientError };
};
