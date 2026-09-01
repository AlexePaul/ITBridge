import type { ArrearsRow } from "~/types/arrears.types";
import type { Invoice, InvoiceWorksheetRow, IssueInvoicesResult } from "~/types/invoice.types";
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

  const previewInvoices = async (parentIds: number[], monthIssued: string) => {
    try {
      const response = await api<Array<{ parentId: number; amount: number }>>(`/invoices/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ parentIds, monthIssued }),
      });
      return response || [];
    } catch (error) {
      console.error("Error previewing invoices:", error);
      return [];
    }
  };

  const generateInvoices = async (parentIds: number[], monthIssued: string) => {
    try {
      await api<void>(`/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parentIds: parentIds,
          monthIssued: monthIssued,
          dateIssued: new Date().toISOString().split("T")[0],
        }),
      });
    } catch (error) {
      console.error("Error generating invoices:", error);
      throw error;
    }
  };

  /**
   * The month's issuing worksheet: every family, every child, every group — and no amounts.
   *
   * The arithmetic happens on the screen as the counts are typed. A total arriving pre-computed
   * would invite pressing the button without reading it.
   */
  const fetchWorksheet = async (monthIssued: string) =>
    api<InvoiceWorksheetRow[]>(`/invoices/worksheet?monthIssued=${monthIssued}`, {
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** Issues the month from the counts on screen. The server bills those numbers, not its own. */
  const issueInvoices = async (payload: {
    monthIssued: string;
    dateIssued: string;
    families: { parentId: number; children: { childId: number; sessions: number }[] }[];
  }) =>
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
    previewInvoices,
    generateInvoices,
  };
};
