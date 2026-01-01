import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useUserStore } from "~/stores/userStore";

export const overdueInvoices = ref<boolean>(false);

export const pendingInvoices = ref<boolean>(true);

export default defineNuxtPlugin(async (nuxtApp) => {
  const userStore = useUserStore();
  const invoiceApi = useInvoiceApi();
  if (userStore.user) {
    await invoiceApi.fetchInvoices();
  }
  for (const invoice of invoiceApi.getInvoices()) {
    if (invoice.status === "overdue") {
      overdueInvoices.value = true;
    }
    if (invoice.status === "pending") {
      pendingInvoices.value = true;
    }
  }
});
