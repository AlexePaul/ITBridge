<template>
  <AdminPage
    title="Plăți"
    subtitle="Toate încasările înregistrate, oricare ar fi metoda"
    width="xl"
  >
    <template #actions>
      <UButton
        color="secondary"
        variant="subtle"
        size="lg"
        class="min-h-11 flex items-center"
        icon="i-lucide-circle-fading-plus"
        to="/admin/payments/new"
      >
        Adaugă plată nouă
      </UButton>
      <UBadge color="primary" variant="subtle" size="lg" class="min-h-11 flex items-center px-4">
        {{ payments.length }} total
      </UBadge>
    </template>

    <!-- Table Card -->
    <UCard class="border">
      <UTable ref="table" :data="payments" :columns="columns" class="w-full" />
    </UCard>
  </AdminPage>
</template>

<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Profile } from "~/types/profile.types";
import { usePaymentsApi } from "~/composables/api/usePaymentsApi";
import type { Payment } from "~/types/payment.types";
import { usePaymentsStore } from "~/stores/paymentsStore";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
} from "~/types/payment.types";

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
      const firstName = row.original.invoice?.parent?.firstName || "";
      const lastName = row.original.invoice?.parent?.lastName || "";
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
    accessorKey: "method",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-wallet-minimal", class: "text-secondary" }),
        h("span", "Metodă"),
      ]),
    cell: ({ row }) =>
      h(
        UBadge,
        { variant: "subtle", color: row.original.method === "cash" ? "secondary" : "primary" },
        () => PAYMENT_METHOD_LABELS[row.original.method]
      ),
  },
  {
    accessorKey: "status",
    header: "Stare",
    cell: ({ row }) =>
      h(
        UBadge,
        { variant: "subtle", color: PAYMENT_STATUS_COLORS[row.original.status] },
        () => PAYMENT_STATUS_LABELS[row.original.status]
      ),
  },
  {
    accessorKey: "amount",
    header: () => h("div", { class: "text-right" }, "Sumă"),
    // The payment's own figure, not the invoice total — since E16/S1 the two can differ, and
    // the difference (an instalment) is exactly what this column exists to show.
    cell: ({ row }) => h("div", { class: "text-right tabular-nums" }, `${row.original.amount} RON`),
  },
  {
    accessorKey: "externalReference",
    header: "Referință",
    cell: ({ row }) => row.original.externalReference || h("span", { class: "text-muted" }, "—"),
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
