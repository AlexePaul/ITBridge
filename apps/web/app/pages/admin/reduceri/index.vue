<template>
  <AdminPage
    title="Reduceri"
    subtitle="Reducerile date de mână, pe o lună anume. Se scad din factura familiei la emitere."
    width="xl"
  >
    <template #actions>
      <UButton color="secondary" variant="subtle" @click="openCreate()">
        <UIcon name="i-lucide-plus" class="mr-2" />
        Adaugă reducere
      </UButton>
    </template>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />

    <AdminEmpty
      v-else-if="discounts.length === 0"
      icon="i-lucide-percent"
      title="Nicio reducere"
      description="Recomandările se dau cu un buton, din profilul familiei: 50% familiei care a adus, și 50% celei nou-venite. Aici se adaugă orice altă reducere, și tot aici se șterg."
    />

    <AdminTable
      v-else
      :rows="discounts"
      :columns="columns"
      :actions="rowActions"
      empty-text="Nicio reducere"
    />

    <UModal v-model:open="formOpen" :title="editing ? 'Editează reducerea' : 'Adaugă reducere'">
      <template #body>
        <form id="discount-form" class="space-y-4" @submit.prevent="submit">
          <UFormField label="Familie" required>
            <UInputMenu
              v-model="selectedParent"
              :items="parentItems"
              :disabled="Boolean(editing)"
              placeholder="Caută familia…"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Motiv" required help="Apare pe listă. „Recomandare” e cel obișnuit.">
            <UInput v-model="draft.name" placeholder="Recomandare" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Fel" required>
              <USelect v-model="draft.type" :items="typeItems" class="w-full" />
            </UFormField>
            <UFormField
              :label="draft.type === 'percent' ? 'Procent' : 'Sumă (lei)'"
              required
              :help="draft.type === 'percent' ? 'Cel mult 100.' : undefined"
            >
              <UInput
                v-model.number="draft.value"
                type="number"
                min="0"
                :max="draft.type === 'percent' ? 100 : undefined"
                step="0.01"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            label="Luna"
            required
            help="Reducerea se aplică facturii acelei luni, și numai ei."
          >
            <UInput v-model="draft.monthIssued" type="month" class="w-full" />
          </UFormField>

          <UFormField label="Detaliu">
            <UInput
              v-model="draft.description"
              placeholder="A recomandat familia Ionescu"
              class="w-full"
            />
          </UFormField>

          <!-- The referral is two discounts, and forgetting the second half is the obvious mistake. -->
          <UCard v-if="looksLikeReferral" variant="subtle" class="border border-info">
            <p class="text-sm">
              La o recomandare sunt <strong>două</strong> reduceri de 50%: una familiei care a
              recomandat, la luna următoare, și una celei nou-venite, la prima ei lună.
            </p>
          </UCard>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false">
            Renunță
          </UButton>
          <UButton type="submit" form="discount-form" :loading="saving" :disabled="!canSubmit">
            {{ editing ? "Salvează" : "Adaugă" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <AdminConfirmModal
      v-model:open="deleteOpen"
      title="Ștergi reducerea?"
      confirm-label="Șterge"
      danger
      :loading="deleting"
      @confirm="remove"
    >
      <template #body>
        <p class="text-sm">
          Facturile deja emise nu se schimbă — suma lor a fost calculată la emitere. Ștergerea
          afectează doar lunile încă nefacturate.
        </p>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useDiscountsApi } from "~/composables/api/useDiscountsApi";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { useNotifications } from "~/composables/useNotifications";
import type { AdminTableColumn } from "~/types/admin-ui.types";
import type { Discount, DiscountType } from "~/types/discount.types";
import type { Profile } from "~/types/profile.types";
import { DISCOUNT_TYPE_LABELS, formatDiscountValue } from "~/types/discount.types";

/**
 * Granting a discount by hand — E15/S5.
 *
 * Exists because the referral decided in E20/S5 has no other door: the benefit is given by the
 * owner, and until now `POST /discounts` was reachable only from an HTTP client.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Reduceri",
});

const discountsApi = useDiscountsApi();
const profileApi = useProfileApi();
const { success, error } = useNotifications();

const loading = ref(true);
const loadError = ref("");
const discounts = ref<Discount[]>([]);
const parentItems = ref<{ value: number; label: string }[]>([]);

const formOpen = ref(false);
const saving = ref(false);
const editing = ref<Discount | null>(null);
const selectedParent = ref<{ value: number; label: string } | undefined>(undefined);

/** This month, as the `type="month"` input wants it. String components — never `toISOString`. */
const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const draft = reactive({
  name: "Recomandare",
  type: "percent" as DiscountType,
  value: 50 as number | undefined,
  monthIssued: thisMonth(),
  description: "",
});

const typeItems = (Object.keys(DISCOUNT_TYPE_LABELS) as DiscountType[]).map((value) => ({
  value,
  label: DISCOUNT_TYPE_LABELS[value],
}));

const looksLikeReferral = computed(
  () => draft.type === "percent" && draft.value === 50 && !editing.value
);

const canSubmit = computed(
  () =>
    Boolean(draft.name.trim()) &&
    Boolean(draft.monthIssued) &&
    typeof draft.value === "number" &&
    draft.value >= 0 &&
    (draft.type !== "percent" || draft.value <= 100) &&
    (Boolean(editing.value) || Boolean(selectedParent.value)) &&
    !saving.value
);

const columns: AdminTableColumn<Discount>[] = [
  { key: "id", label: "#", type: "id" },
  {
    key: "parent",
    label: "Familie",
    icon: "i-lucide-users",
    accessor: (row) => (row.parent ? `${row.parent.firstName} ${row.parent.lastName}` : null),
  },
  { key: "name", label: "Motiv", icon: "i-lucide-tag" },
  {
    key: "type",
    label: "Fel",
    type: "badge",
    accessor: (row) => DISCOUNT_TYPE_LABELS[row.type],
    badgeColor: (row) => (row.type === "percent" ? "info" : "neutral"),
  },
  {
    key: "value",
    label: "Valoare",
    align: "right",
    accessor: (row) => formatDiscountValue(row.value, row.type),
  },
  { key: "monthIssued", label: "Luna", icon: "i-lucide-calendar" },
  { key: "description", label: "Detaliu" },
];

const rowActions = (row: Discount) => [
  { label: "Editează", icon: "i-lucide-pencil", onSelect: () => openCreate(row) },
  {
    label: "Șterge",
    icon: "i-lucide-trash-2",
    color: "error" as const,
    onSelect: () => askDelete(row),
  },
];

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    discounts.value = await discountsApi.fetchDiscounts();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea reducerilor");
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await load();
  try {
    const profiles = await profileApi.fetchProfile();
    parentItems.value = profiles.map((profile: Profile) => ({
      value: profile.id,
      label: `${profile.firstName} ${profile.lastName}`,
    }));
  } catch {
    // The list still reads; only the picker in the form is poorer for it, and the form says so
    // by simply having nothing to choose.
  }
});

const openCreate = (discount?: Discount) => {
  editing.value = discount ?? null;
  if (discount) {
    draft.name = discount.name;
    draft.type = discount.type;
    draft.value = discount.value;
    draft.monthIssued = discount.monthIssued;
    draft.description = discount.description ?? "";
    selectedParent.value = discount.parent
      ? {
          value: discount.parent.id,
          label: `${discount.parent.firstName} ${discount.parent.lastName}`,
        }
      : undefined;
  } else {
    // Defaults to the referral, because that is what this screen is mostly for.
    draft.name = "Recomandare";
    draft.type = "percent";
    draft.value = 50;
    draft.monthIssued = thisMonth();
    draft.description = "";
    selectedParent.value = undefined;
  }
  formOpen.value = true;
};

const submit = async () => {
  if (!canSubmit.value) return;
  saving.value = true;
  try {
    if (editing.value) {
      await discountsApi.updateDiscount(editing.value.id, {
        name: draft.name.trim(),
        type: draft.type,
        value: draft.value!,
        monthIssued: draft.monthIssued,
        description: draft.description || undefined,
      });
      success("Reducerea a fost salvată.");
    } else {
      await discountsApi.createDiscount({
        parentId: selectedParent.value!.value,
        name: draft.name.trim(),
        type: draft.type,
        value: draft.value!,
        monthIssued: draft.monthIssued,
        description: draft.description || undefined,
      });
      success("Reducerea a fost adăugată.");
    }
    formOpen.value = false;
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la salvarea reducerii"));
  } finally {
    saving.value = false;
  }
};

const deleteOpen = ref(false);
const deleting = ref(false);
const toDelete = ref<Discount | null>(null);

const askDelete = (discount: Discount) => {
  toDelete.value = discount;
  deleteOpen.value = true;
};

const remove = async () => {
  if (!toDelete.value) return;
  deleting.value = true;
  try {
    await discountsApi.deleteDiscount(toDelete.value.id);
    success("Reducerea a fost ștearsă.");
    deleteOpen.value = false;
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la ștergerea reducerii"));
  } finally {
    deleting.value = false;
  }
};
</script>
