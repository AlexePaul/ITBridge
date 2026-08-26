<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Factura PDF - {{ invoiceId }}</h1>
        <p class="text-muted mt-1">Previzualizare facturii</p>
      </div>
      <div class="flex gap-2">
        <UButton @click="downloadPdf" :loading="isLoading" icon="i-heroicons-arrow-down-tray">
          Descarcă
        </UButton>
        <UButton @click="navigateTo('/admin/invoices')" variant="outline"> Înapoi </UButton>
      </div>
    </div>

    <div v-if="isLoading" class="flex items-center justify-center h-96">
      <div class="text-center">
        <p class="text-muted">Se încarcă factura...</p>
      </div>
    </div>

    <div
      v-else-if="error"
      class="flex items-center justify-center h-96 bg-red-50 rounded-lg border border-red-200"
    >
      <div class="text-center">
        <p class="text-red-600 font-semibold">Eroare la încărcarea facturii</p>
        <p class="text-red-500 mt-2">{{ error }}</p>
      </div>
    </div>

    <div v-else class="bg-white rounded-lg shadow-lg overflow-hidden">
      <iframe
        v-if="pdfUrl"
        :src="pdfUrl"
        class="w-full"
        style="height: 80vh"
        frameborder="0"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePDFApi } from "~/composables/api/usePDFApi";

const route = useRoute();
const invoiceId = computed(() => route.params.invoiceId as string);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Factura PDF",
});

useHead({
  title: computed(() => `Factura PDF - ${invoiceId.value}`),
});

const pdfApi = usePDFApi();
const isLoading = ref(true);
const error = ref<string | null>(null);
const pdfBlob = ref<Blob | null>(null);
const pdfUrl = ref<string>("");

const loadPdf = async () => {
  try {
    isLoading.value = true;
    error.value = null;
    const blob = await pdfApi.fetchInvoicePdf(Number(invoiceId.value));
    if (blob) {
      pdfBlob.value = blob;
      pdfUrl.value = URL.createObjectURL(blob);
    } else {
      error.value = "Nu s-a putut încărca factura.";
    }
  } catch (err: any) {
    error.value = err.message || "Eroare necunoscută";
  } finally {
    isLoading.value = false;
  }
};

const downloadPdf = async () => {
  if (pdfBlob.value) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(pdfBlob.value);
    link.download = `factura-${invoiceId.value}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
};

onMounted(() => {
  loadPdf();
});

onUnmounted(() => {
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value);
  }
});
</script>
