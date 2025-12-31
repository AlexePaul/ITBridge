<template>
  <h1 class="text-4xl font-bold text-center mt-12 mb-6">Istoric Plati</h1>
  <UTable sticky :data="invoices" :columns="columns" class="flex-1 w-3/4 mx-auto" />
</template>
<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
const UBadge = resolveComponent("UBadge");

interface InvoiceTableElement {
  id: string;
  date: string;
  status: "paid" | "pending" | "overdue";
  name: string;
  amount: number;
}

const InvoiceApi = useInvoiceApi();
const invoices = computed<InvoiceTableElement[]>(() => {
  const list = InvoiceApi.getInvoices() ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((invoice: any) => {
    return {
      id: String(invoice.id),
      date: invoice.dateIssued,
      status: invoice.status,
      name: (invoice.parent.firstName ?? "") + " " + (invoice.parent.lastName ?? ""),
      amount: invoice.amount ?? 0,
    } as InvoiceTableElement;
  });
});

definePageMeta({
  title: "Istoric Plati",
  layout: "default" as any,
  middleware: "auth" as any,
});

onMounted(async () => {
  await InvoiceApi.fetchInvoices();
});

const columns: TableColumn<InvoiceTableElement>[] = [
  {
    accessorKey: "id",
    header: "#",
    cell: ({ row }) => `#${row.getValue("id")}`,
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => {
      return new Date(row.getValue("date")).toLocaleString("ro-RO", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const color = {
        paid: "success" as const,
        pending: "warning" as const,
        overdue: "error" as const,
      }[row.getValue("status") as string];

      return h(UBadge, { class: "capitalize", variant: "subtle", color }, () =>
        row.getValue("status")
      );
    },
  },
  {
    accessorKey: "amount",
    header: () => h("div", { class: "text-right" }, "Amount"),
    cell: ({ row }) => {
      const amount = Number.parseFloat(row.getValue("amount"));

      const formatted = new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency: "RON",
      }).format(amount);

      return h("div", { class: "text-right font-medium" }, formatted);
    },
  },
];
</script>
