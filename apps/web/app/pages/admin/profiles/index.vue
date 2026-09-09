<template>
  <AdminPage title="Profiluri" subtitle="Familiile școlii, cu datele lor de contact" width="xl">
    <template #actions>
      <UButton
        color="secondary"
        variant="subtle"
        size="lg"
        class="min-h-11 flex items-center"
        icon="i-lucide-user-plus"
        to="/admin/profiles/new"
      >
        Adaugă profil nou
      </UButton>
      <UBadge color="primary" variant="subtle" size="lg" class="min-h-11 flex items-center px-4">
        {{ filteredProfiles.length }} total
      </UBadge>
    </template>

    <AdminFilterBar
      :count-label="`Afișez ${filteredProfiles.length} din ${profiles.length} profiluri`"
      :active="hasActiveFilters"
      @clear="clearFilters"
    >
      <AdminSearchInput v-model="filters.search" label="Nume" placeholder="Caută după nume..." />
      <AdminSearchInput
        v-model="filters.email"
        label="Email"
        placeholder="Filtrare după email..."
        icon="i-lucide-mail"
      />
      <AdminSearchInput
        v-model="filters.phone"
        label="Telefon"
        placeholder="Filtrare după telefon..."
        icon="i-lucide-phone"
      />
    </AdminFilterBar>

    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <!--
      The empty state belongs to `AdminTable` now, and it can tell the two empties apart: a school
      with no families, and a filter that matched none. Until E18/S6 measured it this screen had no
      `catch` at all, so an unreachable API read as the first — on the screen where somebody would
      go to add one.
    -->
    <AdminTable
      v-else
      :rows="filteredProfiles"
      :columns="columns"
      :actions="rowActions"
      :to="(profile) => `/admin/profiles/${profile.id}`"
      empty-icon="i-lucide-users"
      :empty-text="hasActiveFilters ? 'Nicio familie nu se potrivește.' : 'Nicio familie încă.'"
      :empty-description="
        hasActiveFilters
          ? 'Încearcă alt nume, email sau telefon.'
          : 'Familiile apar aici după înregistrare sau după ce le adaugă biroul.'
      "
    />
  </AdminPage>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { AdminTableColumn } from "~/types/admin-ui.types";
import { apiErrorMessage } from "~/composables/useApiError";
import { useProfileApi } from "~/composables/api/useProfileApi";
import type { Profile } from "~/types/profile.types";
import { computed } from "vue";

const profileApi = useProfileApi();

const profiles: Ref<Profile[]> = ref([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Profiluri de Utilizatori",
});

// Filters
const filters = ref({
  search: "",
  email: "",
  phone: "",
});

const hasActiveFilters = computed(() => {
  return !!(filters.value.search || filters.value.email || filters.value.phone);
});

const filteredProfiles = computed(() => {
  let result = [...profiles.value];

  // Search filter (name)
  if (filters.value.search) {
    const search = filters.value.search.toLowerCase();
    result = result.filter(
      (p) =>
        p.firstName?.toLowerCase().includes(search) || p.lastName?.toLowerCase().includes(search)
    );
  }

  // Email filter
  if (filters.value.email) {
    const email = filters.value.email.toLowerCase();
    result = result.filter((p) => p.email?.toLowerCase().includes(email));
  }

  // Phone filter
  if (filters.value.phone) {
    const phone = filters.value.phone;
    result = result.filter((p) => p.phone?.includes(phone));
  }

  return result;
});

const clearFilters = () => {
  filters.value.search = "";
  filters.value.email = "";
  filters.value.phone = "";
};

const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    profiles.value = await profileApi.fetchProfile();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca familiile.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

/**
 * The columns, as config rather than a hundred lines of `h()` — E18/S5b, last of the seven dialects.
 *
 * The migration is also where four English strings a person actually reads go away: the column
 * header said "Phone", and the row menu said "Actions", "View Profile", "Add Children" and "Edit
 * Profile", with `aria-label="Actions dropdown"` on the button. The rule is English everywhere
 * except what somebody sees or hears, and a menu is both.
 */
const columns: AdminTableColumn<Profile>[] = [
  { key: "id", label: "#", type: "id" },
  {
    key: "hasUser",
    label: "Are cont",
    type: "badge",
    accessor: (profile) => (profile.hasUser ? "Da" : "Nu"),
    badgeColor: (profile) => (profile.hasUser ? "success" : "error"),
  },
  {
    key: "name",
    label: "Nume",
    icon: "i-lucide-user",
    accessor: (profile) => `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim(),
  },
  { key: "email", label: "Email", icon: "i-lucide-mail" },
  { key: "phone", label: "Telefon", icon: "i-lucide-phone" },
  { key: "address", label: "Adresă", icon: "i-lucide-map-pin" },
  {
    key: "children",
    label: "Copii",
    icon: "i-lucide-baby",
    type: "badge",
    accessor: (profile) => String(profile.children?.length ?? 0),
    badgeColor: () => "secondary",
  },
];

const rowActions = (profile: Profile): DropdownMenuItem[] => [
  { label: "Vezi familia", icon: "i-lucide-eye", to: `/admin/profiles/${profile.id}` },
  {
    label: "Adaugă un copil",
    icon: "i-lucide-plus",
    to: `/admin/profiles/${profile.id}/children/new`,
  },
  { label: "Editează", icon: "i-lucide-pencil", to: `/admin/profiles/${profile.id}/edit` },
];
</script>
