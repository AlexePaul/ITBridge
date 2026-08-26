<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Previzualizare - {{ month }}</h1>
        <p class="text-muted mt-1">
          Previzualizare facturilor care vor fi generate pentru {{ formatMonth(month) }}
        </p>
      </div>
      <div class="flex gap-2">
        <UButton @click="navigateTo('/admin/invoices/new')" variant="outline"> Înapoi </UButton>
      </div>
    </div>

    <div v-if="isLoading" class="flex items-center justify-center h-96">
      <p class="text-muted">Se încarcă previzualizarea...</p>
    </div>

    <div v-else>
      <UTable :data="tableRows" :columns="columns" class="mb-6" />

      <div class="rounded-lg p-2 mb-6 border border-secondary w-1/2 ml-auto">
        <div class="flex justify-between items-center">
          <p class="font-semibold text-lg">Total:</p>
          <p class="font-bold text-xl text-secondary">{{ formatCurrency(totalAmount) }}</p>
        </div>
      </div>

      <div class="flex gap-2 justify-end">
        <UButton @click="navigateTo('/admin/invoices/new')" variant="outline"> Anulează </UButton>
        <UButton @click="confirmGenerate" :loading="isGenerating"> Confirmă și Generează </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useProfileApi } from "~/composables/api/useProfileApi";
import type { Profile } from "~/types/profile.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Previzualizare Facturi",
});

const route = useRoute();
const month = computed(() => route.params.month as string);
const isLoading = ref(true);
const isGenerating = ref(false);

const invoiceApi = useInvoiceApi();
const profileApi = useProfileApi();

const invoiceData = ref<
  Array<{
    profileId: number;
    firstName: string;
    lastName: string;
    numberOfKids: number;
    amount: number;
  }>
>([]);

const columns: TableColumn<any>[] = [
  {
    accessorKey: "profileId",
    header: "ID Profil",
  },
  {
    accessorKey: "parentName",
    header: "Părinte",
  },
  {
    accessorKey: "numberOfKids",
    header: "Număr Copii",
  },
  {
    accessorKey: "amount",
    header: "Sumă Factură",
  },
];

const tableRows = computed(() =>
  invoiceData.value.map((item) => ({
    ...item,
    parentName: `${item.firstName} ${item.lastName}`,
  }))
);

const totalAmount = computed(() => {
  return invoiceData.value.reduce((sum, item) => sum + item.amount, 0);
});

const formatCurrency = (amount: number) => {
  return amount.toLocaleString("ro-RO", { style: "currency", currency: "RON" });
};

const formatMonth = (monthStr: string): string => {
  const monthNames: Record<number, string> = {
    1: "Ianuarie",
    2: "Februarie",
    3: "Martie",
    4: "Aprilie",
    5: "Mai",
    6: "Iunie",
    7: "Iulie",
    8: "August",
    9: "Septembrie",
    10: "Octombrie",
    11: "Noiembrie",
    12: "Decembrie",
  };
  const [year, monthNum] = monthStr.split("-");
  return `${monthNames[Number(monthNum)]} ${year}`;
};

const confirmGenerate = async () => {
  isGenerating.value = true;
  invoiceApi.generateInvoices(
    invoiceData.value.map((item) => item.profileId),
    month.value
  );
  await navigateTo("/admin/invoices");
};

const loadPreviewData = async () => {
  try {
    isLoading.value = true;

    // Fetch all profiles
    const allProfiles = await profileApi.fetchProfile();

    // Get all parent IDs
    const parentIds = (allProfiles || []).map((p: Profile) => p.id);

    // Call preview API once with all parent IDs
    const previewDataArray = await invoiceApi.previewInvoices(parentIds, month.value);

    // Map the response to include profile information
    invoiceData.value = (previewDataArray || []).map((previewItem) => {
      const profile = (allProfiles || []).find((p: Profile) => p.id === previewItem.parentId);
      return {
        profileId: previewItem.parentId,
        firstName: profile?.firstName || "",
        lastName: profile?.lastName || "",
        numberOfKids: profile?.children?.length || 0,
        amount: previewItem.amount,
      };
    });

    // Filter out profiles with 0 amount (no invoice for this month)
    invoiceData.value = invoiceData.value.filter((item) => item.amount > 0);
  } catch (error) {
    console.error("Error loading preview data:", error);
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  await loadPreviewData();
});
</script>
