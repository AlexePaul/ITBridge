import type {
  FiscalDivergenceReport,
  StatementImportResult,
  StatementLineState,
  StatementLinesPage,
  StatementLineView,
} from "~/types/reconciliation.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";

/**
 * E16/S8 — reconciliation: the bank statement and SmartBill, each held against the platform.
 *
 * No store behind it: one screen reads it, right after it asks, so there is nothing to share.
 */
export const useReconciliationApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  /** SmartBill's side as last read, judged against the platform's as it is now. */
  const fetchDivergences = () =>
    api<FiscalDivergenceReport>("/invoices/fiscal-divergences", { method: "GET", headers: auth() });

  /** "Verifică acum": every issued invoice is read again over the next minutes. */
  const refreshDivergences = () =>
    api<{ due: number }>("/invoices/fiscal-divergences/refresh", {
      method: "POST",
      headers: auth(),
    });

  /** The statement's text, as the bank exported it; only incoming lines are kept. */
  const importStatement = (content: string) =>
    api<StatementImportResult>("/reconciliation/statements", {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

  const fetchLines = (state: StatementLineState) =>
    api<StatementLinesPage>(`/reconciliation/lines?state=${state}`, {
      method: "GET",
      headers: auth(),
    });

  /** A line recorded as a transfer on the invoice a person chose. */
  const matchLine = (lineId: number, invoiceId: number, acceptOverpayment = false) =>
    api<StatementLineView>(`/reconciliation/lines/${lineId}/match`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(acceptOverpayment ? { invoiceId, acceptOverpayment } : { invoiceId }),
    });

  /** Every line matched by the invoice's number, in one press. */
  const confirmSuggested = () =>
    api<{ confirmed: number; failed: number }>("/reconciliation/lines/confirm-suggested", {
      method: "POST",
      headers: auth(),
    });

  const ignoreLine = (lineId: number) =>
    api<StatementLineView>(`/reconciliation/lines/${lineId}/ignore`, {
      method: "POST",
      headers: auth(),
    });

  const reopenLine = (lineId: number) =>
    api<StatementLineView>(`/reconciliation/lines/${lineId}/reopen`, {
      method: "POST",
      headers: auth(),
    });

  return {
    fetchDivergences,
    refreshDivergences,
    importStatement,
    fetchLines,
    matchLine,
    confirmSuggested,
    ignoreLine,
    reopenLine,
  };
};
