import type { ArrearsRow } from "~/types/arrears.types";
import type { Invoice, InvoiceWorksheet, IssueInvoicesResult } from "~/types/invoice.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { date } from "zod";

export const overdueInvoices = ref<boolean>(false);

export const pendingInvoices = ref<boolean>(false);

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
    for (const invoice of invoices.value) {
      if (invoice.status === "overdue") {
        overdueInvoices.value = true;
      }
      if (invoice.status === "pending") {
        pendingInvoices.value = true;
      }
    }
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

  /** Who has not paid, oldest debt first — E16/S7. Admin only. */
  const fetchArrears = async () =>
    api<ArrearsRow[]>("/invoices/arrears", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return {
    fetchArrears,
    fetchWorksheet,
    issueInvoices,
    getInvoices,
    fetchInvoices,
  };
};
