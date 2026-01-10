<template>
  <h1>Gestionarea Facturilor</h1>
  <h2>TODO:</h2>
  invoice-urile vor fi generate automat deci aici vreau in principiu o lista cu ele.
  <UButton color="primary" class="mt-4" variant="subtle" @click="handleGenerate"
    >Generează Facturi</UButton
  >
  <template v-for="invoice in invoices" :key="invoice.id">
    <div class="mt-4 p-4 border border-muted rounded-lg">
      <p><strong>ID Factură:</strong> {{ invoice.id }}</p>
      <p>
        <strong>Data Emiterii:</strong>
        {{ new Date(invoice.dateIssued).toLocaleDateString("ro-RO") }}
      </p>
      <p><strong>Lună Emisă:</strong> {{ invoice.monthIssued }}</p>
      <p><strong>Status:</strong> {{ invoice.status }}</p>
    </div>
  </template>
</template>
<script setup lang="ts">
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import type { Invoice } from "~/types/invoice.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Facturilor",
});

const invoiceApi = useInvoiceApi();
const invoices: Ref<Invoice[]> = ref([]);

onMounted(() => {
  invoiceApi.fetchInvoices();
  invoices.value = invoiceApi.getInvoices() || [];
});

const handleGenerate = () => {
  invoiceApi.generateInvoices();
};
</script>
