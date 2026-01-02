import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useUserStore } from "~/stores/userStore";

export default defineNuxtPlugin(async (nuxtApp) => {
  const userStore = useUserStore();
  const invoiceApi = useInvoiceApi();

  if (userStore.user) {
    await invoiceApi.fetchInvoices();
  }
});
