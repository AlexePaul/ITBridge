<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Gestionarea Plăților</h1>
        <p class="text-muted mt-1">Gestionează și vizualizează toate plățile</p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="mr-3 ml-auto flex items-center h-11"
        size="lg"
        @click="navigateTo('/admin/payments/new')"
      >
        <UIcon name="i-lucide-circle-fading-plus" class="mr-2" />
        Adaugă Plata Nouă
      </UButton>
      <UBadge color="primary" variant="subtle" size="lg" class="h-11 flex items-center px-4">
        {{ payments.length }} total
      </UBadge>
    </div>

    <!-- Table Card -->
    <UCard class="border">
      <UTable ref="table" :data="payments" :columns="columns" class="w-full" />
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Profile } from "~/types/profile.types";
import { usePaymentsApi } from "~/composables/api/usePaymentsApi";
import type { Payment } from "~/types/payment.types";
import { usePaymentsStore } from "~/stores/paymentsStore";

const paymentsApi = usePaymentsApi();
const paymentsStore = usePaymentsStore();
const UBadge = resolveComponent("UBadge");
const UIcon = resolveComponent("UIcon");
const UDropdownMenu = resolveComponent("UDropdownMenu");
const UButton = resolveComponent("UButton");

const payments: Ref<Payment[]> = ref([]);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Plăților",
});

onMounted(async () => {
  await paymentsApi.fetchPayments();
  payments.value = (paymentsStore.payments as Payment[]).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  console.log("Payments list:", payments.value);
});

const columns: TableColumn<Payment>[] = [
  {
    accessorKey: "id",
    header: "#",
    cell: ({ row }) =>
      h(
        UBadge,
        { class: "capitalize", variant: "subtle", color: "primary" },
        () => `#${row.getValue("id")}`
      ),
  },
  {
    id: "name",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-user", class: "text-secondary" }),
        h("span", "Nume"),
      ]),
    cell: ({ row }) => {
      const firstName = row.original.invoice?.parent.firstName || "";
      const lastName = row.original.invoice?.parent.lastName || "";
      return `${firstName} ${lastName}`.trim() || h("span", { class: "text-muted" }, "N/A");
    },
  },
  {
    id: "monthIssued",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-calendar", class: "text-secondary" }),
        h("span", "Luna"),
      ]),
    cell: ({ row }) => {
      const monthIssued = row.original.invoice?.monthIssued || "";
      return monthIssued || h("span", { class: "text-muted" }, "N/A");
    },
  },
  {
    accessorKey: "Type",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-wallet-minimal", class: "text-secondary" }),
        h("span", "Tip Tranzacție"),
      ]),
    cell: ({ row }) => {
      const color =
        {
          credit_card: "primary" as const,
          cash: "secondary" as const,
        }[row.original.method as string] || "neutral";
      const method =
        {
          credit_card: "Card de Credit",
          cash: "Numerar",
        }[row.original.method as string] || "Necunoscut";
      return h(UBadge, { class: "capitalize", variant: "subtle", color }, () => method);
    },
  },
  {
    accessorKey: "amount",
    header: () => h("div", { class: "text-right" }, "Sumă"),
    cell: ({ row }) => h("div", { class: "text-right" }, `${row.original.invoice?.amount} RON`),
  },
  {
    id: "actions",
    enableHiding: false,
    meta: {
      class: {
        td: "text-right",
      },
    },
    cell: ({ row }) => {
      const items = [
        {
          type: "label",
          label: "Actions",
        },
        {
          type: "Button",
          label: "Sterge Plata",
          icon: "i-lucide-trash",
          onSelect() {
            paymentsApi.deletePayment(row.original.id);
            navigateTo("/admin/payments");
            payments.value = payments.value.filter((payment) => payment.id !== row.original.id);
          },
        },
      ];

      return h(
        UDropdownMenu,
        {
          content: {
            align: "end",
          },
          items,
          "aria-label": "Actions dropdown",
        },
        () =>
          h(UButton, {
            icon: "i-lucide-ellipsis-vertical",
            color: "neutral",
            variant: "ghost",
            "aria-label": "Actions dropdown",
          })
      );
    },
  },
];
</script>
