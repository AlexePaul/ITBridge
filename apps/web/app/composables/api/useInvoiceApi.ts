import type { ArrearsRow } from "~/types/arrears.types";
import type {
  FiscalQueueStatus,
  Invoice,
  InvoiceWorksheet,
  IssueInvoicesResult,
  SessionCountOverrideDto,
} from "~/types/invoice.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { date } from "zod";

export const useInvoiceApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const invoices = ref<Invoice[]>([]);

  const fetchInvoices = async () => {
    const fetchedInvoices = await api<Invoice[]>("/invoices", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });

    invoices.value = fetchedInvoices;
  };

  const getInvoices = () => {
    return invoices.value;
  };

  /**
   * The month's issuing worksheet — every family, every child, and the count already read from
   * the registers — E15/S9. Plus the month's sessions with no register, which the screen shows
   * first.
   */
  const fetchWorksheet = async (monthIssued: string) =>
    api<InvoiceWorksheet>(`/invoices/worksheet?monthIssued=${monthIssued}`, {
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /**
   * Issues the month. Only the month and the date to print: the server counts from the same
   * registers the worksheet showed, so there is no second number for the two to disagree on.
   */
  const issueInvoices = async (payload: { monthIssued: string; dateIssued: string }) =>
    api<IssueInvoicesResult>("/invoices/issue", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      body: payload,
    });

  /**
   * "Bill this many instead" for one child and month — the override on the issuing screen. A
   * recorded decision, not a number on the issue call; the worksheet reflects it on reload.
   */
  const setSessionCountOverride = async (payload: SessionCountOverrideDto) =>
    api<unknown>("/invoices/overrides", {
      method: "PUT",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      body: payload,
    });

  /** Drops the decision: the registers speak again. */
  const clearSessionCountOverride = async (monthIssued: string, childId: number) =>
    api<unknown>(`/invoices/overrides/${monthIssued}/${childId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** Who has not paid, oldest debt first — E16/S7. Admin only. */
  const fetchArrears = async () =>
    api<ArrearsRow[]>("/invoices/arrears", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /**
   * Where the SmartBill queue stands — E16/S3 — with the mode beside the counts, because "în
   * coadă" means one thing when the platform is sending and another when it is switched off.
   */
  const fetchFiscalQueue = async (monthIssued?: string) =>
    api<FiscalQueueStatus>(
      `/invoices/fiscal-queue${monthIssued ? `?monthIssued=${monthIssued}` : ""}`,
      { headers: { Authorization: `Bearer ${tokenStore.accessToken}` } }
    );

  /** Sends a refused invoice again, or one under review that somebody found missing in SmartBill. */
  const retryFiscal = async (invoiceId: number) =>
    api<Invoice>(`/invoices/${invoiceId}/fiscal/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** "SmartBill did issue it, with this number" — the way out of review. Digits, as SmartBill prints them. */
  const confirmFiscal = async (invoiceId: number, number: string) =>
    api<Invoice>(`/invoices/${invoiceId}/fiscal/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      body: { number },
    });

  return {
    fetchFiscalQueue,
    retryFiscal,
    confirmFiscal,
    fetchArrears,
    fetchWorksheet,
    issueInvoices,
    setSessionCountOverride,
    clearSessionCountOverride,
    getInvoices,
    fetchInvoices,
  };
};
